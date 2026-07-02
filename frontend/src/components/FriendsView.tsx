import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchConversation,
  fetchFriendRecords,
  fetchFriendRequests,
  fetchFriends,
  fetchInvites,
  fetchUnreadMessageCounts,
  respondFriendRequest,
  respondInvite,
  searchUsers,
  sendChatMessage,
  sendFriendRequest,
  sendSwimInvite,
  unfriend,
} from "../api";
import type {
  ChatMessage,
  FriendRequests,
  FriendSearchHit,
  FriendView,
  SwimEvent,
  SwimInvite,
  SwimRecord,
  User,
  UserSummary,
} from "../types";
import type { Character } from "../data/characters";
import { buildSlotsByDay, type Slot } from "../utils/slots";
import { formatDayHeading, formatTime } from "../utils/time";
import SwimmerAvatar from "./SwimmerAvatar";

const FRIENDS_POLL_MS = 12_000;
const CHAT_POLL_MS = 5_000;

/** A friend's avatar colors as a Character for the 2D SwimmerAvatar. */
function friendCharacter(u: UserSummary): Character {
  return {
    id: `friend-${u.id}`,
    name: u.displayName,
    skin: u.avatarSkin,
    suit: u.avatarSuit,
    cap: u.avatarCap,
    modelUrl: "",
  };
}

function FriendFace({ user, size = 40 }: { user: UserSummary; size?: number }) {
  return user.photoUrl ? (
    <img className="friend-face" src={user.photoUrl} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="friend-face friend-face-avatar" style={{ width: size, height: size }}>
      <SwimmerAvatar character={friendCharacter(user)} pose="stand" size={size - 8} />
    </span>
  );
}

function summarize(records: SwimRecord[]) {
  const done = records.filter((r) => r.completedAt && r.distanceMeters != null);
  const total = done.reduce((sum, r) => sum + (r.distanceMeters ?? 0), 0);
  const longest = done.reduce((max, r) => Math.max(max, r.distanceMeters ?? 0), 0);
  return { swims: done.length, total, longest };
}

/** "2026-06-21 07:30:00" → "Sunday, June 21 · 7:30 AM" */
function formatSession(start: string, end: string): string {
  return `${formatDayHeading(start.slice(0, 10))} · ${formatTime(start)}–${formatTime(end)}`;
}

export default function FriendsView({ events, user }: { events: SwimEvent[]; user: User }) {
  const [friends, setFriends] = useState<FriendView[]>([]);
  const [requests, setRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [invites, setInvites] = useState<SwimInvite[]>([]);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FriendSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [friendRecords, setFriendRecords] = useState<SwimRecord[] | null>(null);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => friends.find((f) => f.user.id === selectedId) ?? null,
    [friends, selectedId],
  );
  const slotsByDay = useMemo(() => buildSlotsByDay(events), [events]);

  // ---- polling: friends + requests + invites + unread badges ----
  const refreshSocial = useCallback(async () => {
    try {
      const [fr, rq, inv, un] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests(),
        fetchInvites(),
        fetchUnreadMessageCounts(),
      ]);
      setFriends(fr);
      setRequests(rq);
      setInvites(inv);
      setUnread(un);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your friends.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSocial();
    const timer = setInterval(refreshSocial, FRIENDS_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshSocial]);

  // ---- debounced people search ----
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchUsers(q)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // ---- selected friend: records + live chat ----
  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    // Reset the pane for the newly selected friend before their data arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFriendRecords(null);
    setConversation([]);
    fetchFriendRecords(selectedId)
      .then((rs) => {
        if (!cancelled) setFriendRecords(rs);
      })
      .catch(() => {
        if (!cancelled) setFriendRecords([]);
      });

    const loadChat = () => {
      fetchConversation(selectedId)
        .then((msgs) => {
          if (cancelled) return;
          setConversation(msgs);
          setUnread((u) => (u[selectedId] ? { ...u, [selectedId]: 0 } : u));
        })
        .catch(() => {});
    };
    loadChat();
    const timer = setInterval(loadChat, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversation.length]);

  async function handleSend() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const msg = await sendChatMessage(selectedId, draft.trim());
      setConversation((c) => [...c, msg]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  }

  async function handleInviteSlot(slot: Slot, poolLength: 25 | 50) {
    if (!selectedId) return;
    try {
      await sendSwimInvite({
        friendId: selectedId,
        sessionStart: slot.start,
        sessionEnd: slot.end,
        poolLength,
      });
      setInvitePickerOpen(false);
      refreshSocial();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the invite.");
    }
  }

  const incomingInvites = invites.filter((i) => i.direction === "incoming" && i.status === "PENDING");
  const upcomingPlans = invites.filter((i) => i.status === "ACCEPTED");
  const outgoingPending = invites.filter((i) => i.direction === "outgoing" && i.status === "PENDING");
  const stats = friendRecords ? summarize(friendRecords) : null;

  return (
    <div className="friends-view">
      {error && <p className="error-state">⚠️ {error}</p>}

      <div className="friends-layout">
        {/* ------------------------------ left rail ------------------------------ */}
        <aside className="friends-rail glass-surface" data-glass>
          <div className="friends-search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find swimmers by name or email…"
              aria-label="Search for people"
            />
            {searching && <span className="friends-search-spin">…</span>}
          </div>

          {hits.length > 0 && (
            <ul className="friends-hits">
              {hits.map((hit) => (
                <li key={hit.user.id}>
                  <FriendFace user={hit.user} size={34} />
                  <span className="friend-name">{hit.user.displayName}</span>
                  {hit.relation === "none" && (
                    <button
                      className="mini-btn"
                      onClick={() =>
                        sendFriendRequest(hit.user.id)
                          .then(() => {
                            setHits((h) =>
                              h.map((x) =>
                                x.user.id === hit.user.id ? { ...x, relation: "requested" } : x,
                              ),
                            );
                            refreshSocial();
                          })
                          .catch((err) => setError(err.message))
                      }
                    >
                      ＋ Add
                    </button>
                  )}
                  {hit.relation === "requested" && <span className="mini-tag">Requested</span>}
                  {hit.relation === "friends" && <span className="mini-tag">Friends ✓</span>}
                  {hit.relation === "incoming" && <span className="mini-tag">Check requests</span>}
                </li>
              ))}
            </ul>
          )}

          {requests.incoming.length > 0 && (
            <section className="friends-section">
              <h3>Friend requests</h3>
              <ul className="friends-requests">
                {requests.incoming.map((req) => (
                  <li key={req.id}>
                    <FriendFace user={req.user} size={34} />
                    <span className="friend-name">{req.user.displayName}</span>
                    <span className="req-actions">
                      <button
                        className="mini-btn"
                        onClick={() => respondFriendRequest(req.id, "accept").then(refreshSocial)}
                      >
                        Accept
                      </button>
                      <button
                        className="mini-btn mini-btn-ghost"
                        onClick={() => respondFriendRequest(req.id, "decline").then(refreshSocial)}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="friends-section friends-list-section">
            <h3>
              Friends <span className="count-pill">{friends.length}</span>
            </h3>
            {friends.length === 0 ? (
              <p className="friends-empty">
                No friends yet — search above to add your first swim buddy.
              </p>
            ) : (
              <ul className="friends-list">
                {friends.map((f) => (
                  <li key={f.user.id}>
                    <button
                      className={`friend-row ${selectedId === f.user.id ? "active" : ""}`}
                      onClick={() => setSelectedId(f.user.id)}
                    >
                      <span className={`presence-dot ${f.inPool ? "in-pool" : ""}`} />
                      <FriendFace user={f.user} />
                      <span className="friend-row-main">
                        <span className="friend-name">{f.user.displayName}</span>
                        <span className="friend-sub">
                          {f.inPool
                            ? `In the pool now · Lane ${f.lane} (${f.poolLength}m)`
                            : "Not swimming"}
                        </span>
                      </span>
                      {(unread[f.user.id] ?? 0) > 0 && (
                        <span className="unread-badge">{unread[f.user.id]}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {requests.outgoing.length > 0 && (
              <p className="friends-outgoing">
                {requests.outgoing.length} request{requests.outgoing.length > 1 ? "s" : ""} sent —
                waiting for a reply.
              </p>
            )}
          </section>
        </aside>

        {/* ------------------------------ main pane ------------------------------ */}
        <main className="friends-main">
          {(incomingInvites.length > 0 || upcomingPlans.length > 0 || outgoingPending.length > 0) && (
            <section className="invites-board glass-surface" data-glass>
              <h3>Swim plans</h3>
              {incomingInvites.map((inv) => (
                <div key={inv.id} className="invite-card invite-incoming">
                  <FriendFace user={inv.friend} size={36} />
                  <span className="invite-text">
                    <strong>{inv.friend.displayName}</strong> invites you to swim ·{" "}
                    {formatSession(inv.sessionStart, inv.sessionEnd)} · {inv.poolLength}m pool
                    {inv.note && <em> — “{inv.note}”</em>}
                  </span>
                  <span className="req-actions">
                    <button
                      className="mini-btn"
                      onClick={() => respondInvite(inv.id, "accept").then(refreshSocial)}
                    >
                      Accept 🏊
                    </button>
                    <button
                      className="mini-btn mini-btn-ghost"
                      onClick={() => respondInvite(inv.id, "decline").then(refreshSocial)}
                    >
                      Decline
                    </button>
                  </span>
                </div>
              ))}
              {upcomingPlans.map((inv) => (
                <div key={inv.id} className="invite-card invite-confirmed">
                  <FriendFace user={inv.friend} size={36} />
                  <span className="invite-text">
                    ✅ Swimming with <strong>{inv.friend.displayName}</strong> ·{" "}
                    {formatSession(inv.sessionStart, inv.sessionEnd)} · {inv.poolLength}m pool —
                    meet on the deck and look for their cap!
                  </span>
                </div>
              ))}
              {outgoingPending.map((inv) => (
                <div key={inv.id} className="invite-card invite-pending">
                  <FriendFace user={inv.friend} size={36} />
                  <span className="invite-text">
                    ⏳ Waiting for <strong>{inv.friend.displayName}</strong> ·{" "}
                    {formatSession(inv.sessionStart, inv.sessionEnd)} · {inv.poolLength}m pool
                  </span>
                </div>
              ))}
            </section>
          )}

          {!selected ? (
            <div className="friends-placeholder glass-surface" data-glass>
              <h2>Your swim crew</h2>
              <p>
                Add friends to see their swim records, chat, and invite them to a Length Swim
                session. When a friend is in the pool you'll see them live — both here and swimming
                in the 3D pool.
              </p>
            </div>
          ) : (
            <div className="friend-profile">
              <header className="friend-profile-head glass-surface" data-glass>
                <FriendFace user={selected.user} size={56} />
                <div className="friend-profile-id">
                  <h2>{selected.user.displayName}</h2>
                  <p className={selected.inPool ? "profile-inpool" : "profile-idle"}>
                    {selected.inPool
                      ? `🌊 In the pool right now — Lane ${selected.lane}, ${selected.poolLength}m pool. Go say hi!`
                      : "Not in the pool right now"}
                  </p>
                </div>
                <div className="friend-profile-actions">
                  <button className="length-button" onClick={() => setInvitePickerOpen(true)}>
                    Invite to swim 🤝
                  </button>
                  <button
                    className="mini-btn mini-btn-ghost"
                    title="Remove friend"
                    onClick={() =>
                      unfriend(selected.user.id).then(() => {
                        setSelectedId(null);
                        refreshSocial();
                      })
                    }
                  >
                    Unfriend
                  </button>
                </div>
              </header>

              <div className="friend-profile-grid">
                <section className="friend-records glass-surface" data-glass>
                  <h3>Swim records</h3>
                  {friendRecords === null ? (
                    <p className="friends-empty">Loading…</p>
                  ) : (
                    <>
                      {stats && (
                        <div className="friend-stats">
                          <div className="friend-stat">
                            <strong>{stats.swims}</strong>
                            <span>swims</span>
                          </div>
                          <div className="friend-stat">
                            <strong>{stats.total.toLocaleString()}m</strong>
                            <span>total</span>
                          </div>
                          <div className="friend-stat">
                            <strong>{stats.longest.toLocaleString()}m</strong>
                            <span>longest</span>
                          </div>
                        </div>
                      )}
                      {friendRecords.length === 0 ? (
                        <p className="friends-empty">No swims logged yet.</p>
                      ) : (
                        <ul className="friend-record-list">
                          {friendRecords.slice(0, 12).map((r) => (
                            <li key={r.id}>
                              <span className="rec-when">
                                {new Date(r.startedAt).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                              <span className="rec-what">
                                {r.completedAt
                                  ? `${r.distanceMeters ?? 0}m`
                                  : "swimming now…"}{" "}
                                · Lane {r.lane} · {r.poolLength}m pool
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </section>

                <section className="friend-chat glass-surface" data-glass>
                  <h3>Messages</h3>
                  <div className="chat-thread">
                    {conversation.length === 0 && (
                      <p className="friends-empty">Say hi to {selected.user.displayName}! 👋</p>
                    )}
                    {conversation.map((m) => (
                      <div
                        key={m.id}
                        className={`chat-bubble ${m.senderId === user.id ? "mine" : "theirs"}`}
                      >
                        <p>{m.body}</p>
                        <time>
                          {new Date(m.sentAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form
                    className="chat-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                  >
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Message ${selected.user.displayName}…`}
                      maxLength={2000}
                      disabled={sending}
                    />
                    <button type="submit" className="mini-btn" disabled={sending || !draft.trim()}>
                      Send
                    </button>
                  </form>
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --------------------------- invite session picker --------------------------- */}
      <AnimatePresence>
        {invitePickerOpen && selected && (
          <motion.div
            className="invite-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setInvitePickerOpen(false)}
          >
            <motion.div
              className="invite-modal glass-surface"
              data-glass
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>
                Pick a session to swim with {selected.user.displayName}
              </h3>
              {slotsByDay.length === 0 ? (
                <p className="friends-empty">No upcoming Length Swim sessions in the schedule.</p>
              ) : (
                <div className="invite-slot-days">
                  {slotsByDay.map(([dayKey, slots]) => (
                    <section key={dayKey}>
                      <h4>{formatDayHeading(dayKey)}</h4>
                      <div className="invite-slot-list">
                        {slots.map((slot) =>
                          slot.lengths.map((len) => (
                            <button
                              key={`${slot.start}|${len}`}
                              className="invite-slot-btn"
                              onClick={() => handleInviteSlot(slot, len)}
                            >
                              <span>
                                {formatTime(slot.start)}–{formatTime(slot.end)}
                              </span>
                              <span className={`len-tag len-${len}`}>{len}m</span>
                            </button>
                          )),
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              <button className="mini-btn mini-btn-ghost" onClick={() => setInvitePickerOpen(false)}>
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
