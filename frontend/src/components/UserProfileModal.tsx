import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchUserProfile,
  respondFriendRequest,
  sendFriendRequest,
  unfriend,
} from "../api";
import type { PublicProfile, UserSummary } from "../types";
import UserFace from "./UserFace";

/**
 * The one profile card used everywhere someone taps a user: ranking rows,
 * search results, and friend-request notifications. Shows public stats and
 * offers the right actions for the relationship — add friend (with an
 * optional intro note), accept/decline, message, unfriend.
 */
export default function UserProfileModal({
  userId,
  onClose,
  onOpenChat,
  onChanged,
}: {
  userId: number;
  onClose: () => void;
  onOpenChat: (user: UserSummary) => void;
  onChanged?: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchUserProfile(userId)
      .then((p) => {
        setProfile(p);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this profile."));
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(null);
    setAddOpen(false);
    setNote("");
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const p = profile;

  return (
    <AnimatePresence>
      <motion.div
        className="invite-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="invite-modal profile-modal glass-surface"
          data-glass
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
        >
          {error && <p className="error-state">⚠️ {error}</p>}

          {!p && !error && <p className="friends-empty">Loading profile…</p>}

          {p && (
            <>
              <header className="profile-modal-head">
                <UserFace user={p.user} size={64} />
                <div>
                  <h3>{p.user.displayName}</h3>
                  <p className={p.inPool ? "profile-inpool" : "profile-idle"}>
                    {p.inPool
                      ? `🌊 In the pool now — Lane ${p.lane}, ${p.poolLength}m`
                      : "Not in the pool right now"}
                  </p>
                </div>
                <button className="profile-modal-close" onClick={onClose} aria-label="Close">
                  ✕
                </button>
              </header>

              <div className="friend-stats">
                <div className="friend-stat">
                  <strong>{p.swims}</strong>
                  <span>swims</span>
                </div>
                <div className="friend-stat">
                  <strong>{p.totalMeters.toLocaleString()}m</strong>
                  <span>total</span>
                </div>
                <div className="friend-stat">
                  <strong>{p.longestMeters.toLocaleString()}m</strong>
                  <span>longest</span>
                </div>
              </div>

              {p.relation === "incoming" && (
                <div className="profile-request-box">
                  <p>
                    <strong>{p.user.displayName}</strong> sent you a friend request
                    {p.requestMessage ? ":" : "."}
                  </p>
                  {p.requestMessage && <blockquote>“{p.requestMessage}”</blockquote>}
                  <div className="profile-actions">
                    <button
                      className="length-button"
                      disabled={busy}
                      onClick={() => run(() => respondFriendRequest(p.incomingRequestId!, "accept"))}
                    >
                      Accept 🤝
                    </button>
                    <button
                      className="mini-btn mini-btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        run(() => respondFriendRequest(p.incomingRequestId!, "decline"))
                      }
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {p.relation !== "self" && (
                <div className="profile-actions">
                  <button className="length-button" onClick={() => onOpenChat(p.user)}>
                    Message 💬
                  </button>

                  {p.relation === "none" && !addOpen && (
                    <button className="mini-btn" onClick={() => setAddOpen(true)}>
                      ＋ Add friend
                    </button>
                  )}
                  {p.relation === "requested" && <span className="mini-tag">Request sent ✓</span>}
                  {p.relation === "friends" && (
                    <button
                      className="mini-btn mini-btn-ghost"
                      disabled={busy}
                      onClick={() => run(() => unfriend(p.user.id))}
                    >
                      Unfriend
                    </button>
                  )}
                </div>
              )}

              {p.relation === "none" && !addOpen && p.introRemaining != null && (
                <p className="profile-hint">
                  Not friends yet — you can send {p.introRemaining} intro message
                  {p.introRemaining === 1 ? "" : "s"} before adding them.
                </p>
              )}

              {addOpen && (
                <form
                  className="profile-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => sendFriendRequest(p.user.id, note)).then(() => setAddOpen(false));
                  }}
                >
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    rows={3}
                    placeholder={`Add a note so ${p.user.displayName} knows who you are (optional)…`}
                  />
                  <div className="profile-actions">
                    <button className="length-button" type="submit" disabled={busy}>
                      Send request
                    </button>
                    <button
                      className="mini-btn mini-btn-ghost"
                      type="button"
                      onClick={() => setAddOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
