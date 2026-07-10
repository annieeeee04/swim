import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchChatList,
  fetchConversation,
  fetchFriendRecords,
  fetchFriendRequests,
  fetchFriends,
  fetchInvites,
  fetchUserProfile,
  respondFriendRequest,
  respondInvite,
  searchUsers,
  sendChatMessage,
  sendSwimInvite,
  unfriend,
} from "../api";
import type {
  ChatListItem,
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
import { onRealtimeEvent } from "../realtime";
import { buildSlotsByDay, type Slot } from "../utils/slots";
import { formatDayHeading, formatTime } from "../utils/time";
import UserFace from "./UserFace";

// Slow safety-net polls only — presence, chat, requests and invites all
// arrive live over the WebSocket (see ../realtime.ts).
const FRIENDS_POLL_MS = 60_000;
const CHAT_POLL_MS = 20_000;

/** One row in the unified left-rail chat list (friend or stranger chat). */
interface RailRow {
  user: UserSummary;
  friends: boolean;
  inPool: boolean;
  lane: number | null;
  poolLength: number | null;
  unread: number;
  lastBody: string | null;
  lastFromMe: boolean;
  introRemaining: number | null;
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

/**
 * The unified social hub: a fixed-width, scrollable chat list on the left
 * (friends and stranger chats together), and one card on the right that
 * combines the selected person's profile strip, a fixed-height chat thread,
 * and their swim records — no more three floating boxes.
 */
export default function FriendsView({
  events,
  user,
  initialChatUserId,
  onInitialChatConsumed,
  onOpenProfile,
}: {
  events: SwimEvent[];
  user: User;
  initialChatUserId?: number | null;
  onInitialChatConsumed?: () => void;
  onOpenProfile: (userId: number) => void;
}) {
  const [friends, setFriends] = useState<FriendView[]>([]);
  const [requests, setRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [invites, setInvites] = useState<SwimInvite[]>([]);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selected, setSelected] = useState<UserSummary | null>(null);
  const [selectedIntro, setSelectedIntro] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FriendSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [paneTab, setPaneTab] = useState<"chat" | "records">("chat");
  const [friendRecords, setFriendRecords] = useState<SwimRecord[] | null>(null);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const slotsByDay = useMemo(() => buildSlotsByDay(events), [events]);

  const selectedFriendView = useMemo(
    () => (selected ? friends.find((f) => f.user.id === selected.id) ?? null : null),
    [friends, selected],
  );
  const selectedIsFriend = selectedFriendView !== null;

  // ---- unified left-rail rows: chats first (newest), then message-less friends ----
  const railRows = useMemo<RailRow[]>(() => {
    const presence = new Map(friends.map((f) => [f.user.id, f]));
    const rows: RailRow[] = chats.map((c) => {
      const fv = presence.get(c.user.id);
      return {
        user: c.user,
        friends: c.friends,
        inPool: fv?.inPool ?? false,
        lane: fv?.lane ?? null,
        poolLength: fv?.poolLength ?? null,
        unread: c.unread,
        lastBody: c.lastBody,
        lastFromMe: c.lastFromMe,
        introRemaining: c.introRemaining,
      };
    });
    const inChats = new Set(chats.map((c) => c.user.id));
    for (const f of friends) {
      if (!inChats.has(f.user.id)) {
        rows.push({
          user: f.user,
          friends: true,
          inPool: f.inPool,
          lane: f.lane,
          poolLength: f.poolLength,
          unread: 0,
          lastBody: null,
          lastFromMe: false,
          introRemaining: null,
        });
      }
    }
    return rows;
  }, [chats, friends]);

  // ---- polling: friends + requests + invites + chat list ----
  const refreshSocial = useCallback(async () => {
    try {
      const [fr, rq, inv, ch] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests(),
        fetchInvites(),
        fetchChatList(),
      ]);
      setFriends(fr);
      setRequests(rq);
      setInvites(inv);
      setChats(ch);
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

  // Deep link: "open the chat with user N" (from the bell, ranking, search…).
  useEffect(() => {
    if (initialChatUserId == null) return;
    let cancelled = false;
    fetchUserProfile(initialChatUserId)
      .then((p) => {
        if (cancelled) return;
        setSelected(p.user);
        setSelectedIntro(p.relation === "friends" ? null : p.introRemaining);
      })
      .catch(() => {})
      .finally(() => onInitialChatConsumed?.());
    return () => {
      cancelled = true;
    };
  }, [initialChatUserId, onInitialChatConsumed]);

  // Live updates over the WebSocket.
  useEffect(() => {
    return onRealtimeEvent((event) => {
      if (event.type === "social" || event.type === "presence") {
        refreshSocial();
      } else if (event.type === "message") {
        const msg = event.data as ChatMessage;
        if (msg.senderId === selected?.id) {
          setConversation((c) => (c.some((m) => m.id === msg.id) ? c : [...c, msg]));
        } else {
          refreshSocial(); // bumps unread badge + reorders the chat list
        }
      }
    });
  }, [refreshSocial, selected]);

  // ---- debounced people search (hits open the shared profile card) ----
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

  // ---- selected person: chat (+records when they're a friend) ----
  useEffect(() => {
    if (!selected) return;
    const selectedId = selected.id;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversation([]);
    setFriendRecords(null);
    setPaneTab("chat");
    setDraft("");

    const loadChat = () => {
      fetchConversation(selectedId)
        .then((msgs) => {
          if (cancelled) return;
          setConversation(msgs);
          setChats((cs) =>
            cs.map((c) => (c.user.id === selectedId ? { ...c, unread: 0 } : c)),
          );
        })
        .catch(() => {});
    };
    loadChat();
    const timer = setInterval(loadChat, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected]);

  useEffect(() => {
    if (!selected || !selectedIsFriend) return;
    let cancelled = false;
    fetchFriendRecords(selected.id)
      .then((rs) => {
        if (!cancelled) setFriendRecords(rs);
      })
      .catch(() => {
        if (!cancelled) setFriendRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, selectedIsFriend]);

  // Keep the stranger allowance in sync with the chat list.
  useEffect(() => {
    if (!selected) return;
    if (selectedIsFriend) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIntro(null);
      return;
    }
    const item = chats.find((c) => c.user.id === selected.id);
    if (item) {
      setSelectedIntro(item.introRemaining);
    }
  }, [chats, selected, selectedIsFriend]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversation.length]);

  function selectRow(row: RailRow) {
    setSelected(row.user);
    setSelectedIntro(row.friends ? null : row.introRemaining);
  }

  async function handleSend() {
    if (!selected || !draft.trim()) return;
    setSending(true);
    try {
      const msg = await sendChatMessage(selected.id, draft.trim());
      setConversation((c) => [...c, msg]);
      setDraft("");
      if (!selectedIsFriend && selectedIntro != null) {
        setSelectedIntro(Math.max(0, selectedIntro - 1));
      }
      refreshSocial();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  }

  async function handleInviteSlot(slot: Slot, poolLength: 25 | 50) {
    if (!selected) return;
    try {
      await sendSwimInvite({
        friendId: selected.id,
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
  const introExhausted = !selectedIsFriend && selectedIntro === 0;

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
                  <button className="friend-row" onClick={() => onOpenProfile(hit.user.id)}>
                    <UserFace user={hit.user} size={34} />
                    <span className="friend-row-main">
                      <span className="friend-name">{hit.user.displayName}</span>
                      <span className="friend-sub">
                        {hit.relation === "friends" && "Friends ✓"}
                        {hit.relation === "requested" && "Request sent"}
                        {hit.relation === "incoming" && "Sent you a request"}
                        {hit.relation === "none" && "View profile"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {requests.incoming.length > 0 && (
            <section className="friends-section">
              <h3>
                Friend requests <span className="count-pill">{requests.incoming.length}</span>
              </h3>
              <ul className="friends-requests">
                {requests.incoming.map((req) => (
                  <li key={req.id}>
                    <button className="friend-row" onClick={() => onOpenProfile(req.user.id)}>
                      <UserFace user={req.user} size={34} />
                      <span className="friend-row-main">
                        <span className="friend-name">{req.user.displayName}</span>
                        <span className="friend-sub">
                          {req.message ? `“${req.message}”` : "Tap to view profile"}
                        </span>
                      </span>
                    </button>
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
              Chats <span className="count-pill">{railRows.length}</span>
            </h3>
            {railRows.length === 0 ? (
              <p className="friends-empty">
                No chats yet — search above to find your first swim buddy.
              </p>
            ) : (
              <ul className="friends-list">
                {railRows.map((row) => (
                  <li key={row.user.id}>
                    <button
                      className={`friend-row ${selected?.id === row.user.id ? "active" : ""}`}
                      onClick={() => selectRow(row)}
                    >
                      <span className={`presence-dot ${row.inPool ? "in-pool" : ""}`} />
                      <UserFace user={row.user} />
                      <span className="friend-row-main">
                        <span className="friend-name">
                          {row.user.displayName}
                          {!row.friends && <span className="stranger-tag">new</span>}
                        </span>
                        <span className="friend-sub">
                          {row.inPool
                            ? `In the pool now · Lane ${row.lane} (${row.poolLength}m)`
                            : row.lastBody
                              ? `${row.lastFromMe ? "You: " : ""}${row.lastBody}`
                              : "Not swimming"}
                        </span>
                      </span>
                      {row.unread > 0 && <span className="unread-badge">{row.unread}</span>}
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
                  <UserFace user={inv.friend} size={36} />
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
                  <UserFace user={inv.friend} size={36} />
                  <span className="invite-text">
                    ✅ Swimming with <strong>{inv.friend.displayName}</strong> ·{" "}
                    {formatSession(inv.sessionStart, inv.sessionEnd)} · {inv.poolLength}m pool —
                    meet on the deck and look for their cap!
                  </span>
                </div>
              ))}
              {outgoingPending.map((inv) => (
                <div key={inv.id} className="invite-card invite-pending">
                  <UserFace user={inv.friend} size={36} />
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
                Pick a chat on the left, or search to meet new swimmers. You can send anyone a few
                intro messages — add them as a friend to chat freely, see their records, and plan
                swims together.
              </p>
            </div>
          ) : (
            <section className="friend-hub glass-surface" data-glass>
              {/* ---- profile strip ---- */}
              <header className="friend-hub-head">
                <button
                  className="friend-hub-identity"
                  onClick={() => onOpenProfile(selected.id)}
                  title="View profile"
                >
                  <UserFace user={selected} size={52} />
                  <span className="friend-profile-id">
                    <h2>{selected.displayName}</h2>
                    <p className={selectedFriendView?.inPool ? "profile-inpool" : "profile-idle"}>
                      {selectedFriendView?.inPool
                        ? `🌊 In the pool — Lane ${selectedFriendView.lane}, ${selectedFriendView.poolLength}m. Go say hi!`
                        : selectedIsFriend
                          ? "Not in the pool right now"
                          : "Not friends yet"}
                    </p>
                  </span>
                </button>

                {selectedIsFriend && stats && (
                  <div className="friend-hub-stats">
                    <span>
                      <strong>{stats.swims}</strong> swims
                    </span>
                    <span>
                      <strong>{stats.total.toLocaleString()}m</strong> total
                    </span>
                    <span>
                      <strong>{stats.longest.toLocaleString()}m</strong> longest
                    </span>
                  </div>
                )}

                <div className="friend-profile-actions">
                  {selectedIsFriend ? (
                    <>
                      <button className="length-button" onClick={() => setInvitePickerOpen(true)}>
                        Invite to swim 🤝
                      </button>
                      <button
                        className="mini-btn mini-btn-ghost"
                        title="Remove friend"
                        onClick={() =>
                          unfriend(selected.id).then(() => {
                            setSelected(null);
                            refreshSocial();
                          })
                        }
                      >
                        Unfriend
                      </button>
                    </>
                  ) : (
                    <button className="length-button" onClick={() => onOpenProfile(selected.id)}>
                      ＋ Add friend
                    </button>
                  )}
                </div>
              </header>

              {/* ---- segmented control (records are friends-only) ---- */}
              {selectedIsFriend && (
                <div className="friend-hub-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={paneTab === "chat"}
                    className={paneTab === "chat" ? "active" : ""}
                    onClick={() => setPaneTab("chat")}
                  >
                    Chat
                  </button>
                  <button
                    role="tab"
                    aria-selected={paneTab === "records"}
                    className={paneTab === "records" ? "active" : ""}
                    onClick={() => setPaneTab("records")}
                  >
                    Swim records
                  </button>
                </div>
              )}

              {/* ---- body ---- */}
              {paneTab === "records" && selectedIsFriend ? (
                <div className="friend-hub-records">
                  {friendRecords === null ? (
                    <p className="friends-empty">Loading…</p>
                  ) : friendRecords.length === 0 ? (
                    <p className="friends-empty">No swims logged yet.</p>
                  ) : (
                    <ul className="friend-record-list">
                      {friendRecords.map((r) => (
                        <li key={r.id}>
                          <span className="rec-when">
                            {new Date(r.startedAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <span className="rec-what">
                            {r.completedAt ? `${r.distanceMeters ?? 0}m` : "swimming now…"} · Lane{" "}
                            {r.lane} · {r.poolLength}m pool
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <>
                  {!selectedIsFriend && selectedIntro != null && selectedIntro > 0 && (
                    <p className="stranger-banner">
                      👋 You're not friends with {selected.displayName} yet — you can send{" "}
                      <strong>
                        {selectedIntro} more intro message{selectedIntro === 1 ? "" : "s"}
                      </strong>
                      . Add them as a friend for unlimited chat.
                    </p>
                  )}

                  <div className="chat-thread">
                    {conversation.length === 0 && (
                      <p className="friends-empty">Say hi to {selected.displayName}! 👋</p>
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

                  {introExhausted ? (
                    <div className="stranger-limit-alert">
                      <p>
                        🔒 You've used your intro messages. Add{" "}
                        <strong>{selected.displayName}</strong> as a friend to keep chatting.
                      </p>
                      <button className="length-button" onClick={() => onOpenProfile(selected.id)}>
                        ＋ Add friend
                      </button>
                    </div>
                  ) : (
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
                        placeholder={`Message ${selected.displayName}…`}
                        maxLength={2000}
                        disabled={sending}
                      />
                      <button type="submit" className="mini-btn" disabled={sending || !draft.trim()}>
                        Send
                      </button>
                    </form>
                  )}
                </>
              )}
            </section>
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
              <h3>Pick a session to swim with {selected.displayName}</h3>
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
