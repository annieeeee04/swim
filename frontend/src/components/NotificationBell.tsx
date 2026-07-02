import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
} from "../api";
import { onRealtimeEvent } from "../realtime";
import type { AppNotification, NotificationType } from "../types";

/** Slow safety-net poll only — new notifications arrive live over the WebSocket. */
const POLL_MS = 60_000;

const TYPE_ICON: Record<NotificationType, string> = {
  FRIEND_REQUEST: "🤝",
  FRIEND_ACCEPTED: "🎉",
  MESSAGE: "💬",
  INVITE: "🏊",
  INVITE_ACCEPTED: "✅",
  INVITE_DECLINED: "😢",
  FRIEND_IN_POOL: "🌊",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Header bell: polls the unread notification count, and on open shows the
 * recent feed (friend requests, messages, swim invites & confirmations) and
 * marks everything read.
 */
export default function NotificationBell({
  onGoToFriends,
}: {
  onGoToFriends?: () => void;
}) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(() => {
    fetchUnreadNotificationCount()
      .then(setCount)
      .catch(() => {});
  }, []);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  // Live updates: a pushed notification bumps the badge instantly (and
  // refreshes the list if the panel is already open).
  useEffect(() => {
    return onRealtimeEvent((event) => {
      if (event.type !== "notification") return;
      setCount((c) => c + 1);
      setItems((current) => {
        if (current === null) return current; // panel never opened yet
        const incoming = event.data as AppNotification;
        if (current.some((n) => n.id === incoming.id)) return current;
        return [incoming, ...current];
      });
    });
  }, []);

  // Close when clicking anywhere outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        const list = await fetchNotifications();
        setItems(list);
        if (list.some((n) => !n.readAt)) {
          await markNotificationsRead();
        }
        setCount(0);
      } catch {
        setItems([]);
      }
    }
  }

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        className="notif-bell-btn"
        onClick={toggle}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
      >
        🔔
        {count > 0 && <span className="notif-count">{count > 9 ? "9+" : count}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-panel glass-surface"
            data-glass
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <header>
              <h4>Notifications</h4>
              {onGoToFriends && (
                <button
                  className="mini-btn mini-btn-ghost"
                  onClick={() => {
                    setOpen(false);
                    onGoToFriends();
                  }}
                >
                  Open Friends →
                </button>
              )}
            </header>
            {items === null ? (
              <p className="notif-empty">Loading…</p>
            ) : items.length === 0 ? (
              <p className="notif-empty">Nothing yet — add some friends! 🏊</p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className={n.readAt ? "" : "unread"}>
                    <span className="notif-icon">{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <span className="notif-body">
                      <span className="notif-text">{n.text}</span>
                      <time>{timeAgo(n.createdAt)}</time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
