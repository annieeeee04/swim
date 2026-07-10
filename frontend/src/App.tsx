import { useCallback, useEffect, useState, type ReactNode } from "react";
import "./App.css";
import "./arcade.css";
import "./components/PoolView.css";
import "./components/RecordsView.css";
import "./components/IntroPage.css";
import "./components/AquaticCenterSchedule.css";
import "./components/AuthScreen.css";
import "./components/Leaderboard.css";
import "./components/FriendsView.css";
import "./theme.css";
import { fetchSchedule, fetchSwimHistory, getAuthToken, refreshSchedule } from "./api";
import { connectRealtime, disconnectRealtime } from "./realtime";
import { useAuth } from "./auth/AuthContext";
import PoolView from "./components/PoolView";
import AquaticCenterSchedule from "./components/AquaticCenterSchedule";
import RecordsView from "./components/RecordsView";
import Leaderboard from "./components/Leaderboard";
import FriendsView from "./components/FriendsView";
import NotificationBell from "./components/NotificationBell";
import FluidCursor from "./components/FluidCursor";
import IntroPage from "./components/IntroPage";
import AuthScreen from "./components/AuthScreen";
import SwimSchool from "./components/SwimSchool";
import CoachView from "./components/CoachView";
import SwimmerAvatar from "./components/SwimmerAvatar";
import UserProfileModal from "./components/UserProfileModal";
import type { Character } from "./data/characters";
import type { PoolFilter, SwimEvent, User } from "./types";

type Tab = "schedule" | "pool" | "friends" | "records" | "ranking" | "coach";

const FILTERS: { value: PoolFilter; label: string }[] = [
  { value: "all", label: "All Pools" },
  { value: "25m", label: "25m only" },
  { value: "50m", label: "50m only" },
];

/** Sidebar nav + per-page header copy. */
const TABS: { id: Tab; label: string; title: string; sub: string; icon: ReactNode }[] = [
  {
    id: "schedule",
    label: "Schedule",
    title: "Schedule",
    sub: "UBC Aquatic Centre · next 7 days",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    id: "pool",
    label: "Pool",
    title: "Pool",
    sub: "Jump in and log your swim",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M2 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
        <path d="M8 15V6a2 2 0 0 1 4 0M14 15V6a2 2 0 0 1 4 0" />
      </svg>
    ),
  },
  {
    id: "friends",
    label: "Friends",
    title: "Friends",
    sub: "Chats, requests & swim plans",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5M16 5a3.5 3.5 0 0 1 0 7M21.5 20c-.5-2.2-1.8-3.7-3.7-4.4" />
      </svg>
    ),
  },
  {
    id: "ranking",
    label: "Ranking",
    title: "Today's Ranking",
    sub: "Most metres swum today",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8 21h8M12 17v4M17 5h3a1 1 0 0 1 1 1c0 3-2 5-4.5 5.5M7 5H4a1 1 0 0 0-1 1c0 3 2 5 4.5 5.5" />
        <path d="M7 3h10v5a5 5 0 0 1-10 0z" />
      </svg>
    ),
  },
  {
    id: "records",
    label: "My Records",
    title: "My Records",
    sub: "Every lap you've logged",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    id: "coach",
    label: "Coach",
    title: "Coach",
    sub: "Your AI swim coach",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z" />
        <path d="M19 14l.9 2.4 2.1.9-2.1.9L19 20.5l-.9-2.3-2.1-.9 2.1-.9zM5 15l.7 1.9 1.8.7-1.8.7L5 20.2l-.7-1.9-1.8-.7 1.8-.7z" />
      </svg>
    ),
  },
];

/** The user's chosen avatar colors as a Character for the 2D SwimmerAvatar. */
function userCharacter(user: User): Character {
  return {
    id: `me-${user.id}`,
    name: user.displayName,
    skin: user.avatarSkin ?? "#f3c89e",
    suit: user.avatarSuit ?? "#ec4899",
    cap: user.avatarCap ?? "#a855f7",
    modelUrl: "",
  };
}

function App() {
  const { user, loading: authLoading, logout } = useAuth();
  const [started, setStarted] = useState(false);
  const [tab, setTab] = useState<Tab>("schedule");
  const [events, setEvents] = useState<SwimEvent[]>([]);
  const [filter, setFilter] = useState<PoolFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cross-tab social navigation: any view can open a user's profile card, and
  // the card (or a message notification) can jump straight into their chat.
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [pendingChatUserId, setPendingChatUserId] = useState<number | null>(null);

  const openProfile = useCallback((userId: number) => setProfileUserId(userId), []);
  const openChat = useCallback((userId: number) => {
    setProfileUserId(null);
    setPendingChatUserId(userId);
    setTab("friends");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSchedule();
      setEvents(data.events);
      setLastUpdated(data.lastUpdated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const data = await refreshSchedule();
      setEvents(data.events);
      setLastUpdated(data.lastUpdated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh schedule.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: load() is async, so the resulting setState calls
    // happen after this effect body has already returned.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // A social-login redirect lands back with a token already in hand, so skip
  // the intro and go straight in once the session resolves.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user && !started) setStarted(true);
  }, [user, started]);

  // Live push channel: one WebSocket per signed-in session, carrying friend
  // presence, chat messages, invites and notifications in real time.
  useEffect(() => {
    if (!user) return;
    const token = getAuthToken();
    if (!token) return;
    connectRealtime(token);
    return () => disconnectRealtime();
  }, [user]);

  // Lifetime stats for the sidebar profile card (swims · km · hours).
  const [myStats, setMyStats] = useState({ swims: 0, km: 0, hrs: 0 });
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchSwimHistory()
      .then((records) => {
        if (cancelled) return;
        let swims = 0;
        let meters = 0;
        let ms = 0;
        for (const r of records) {
          if (!r.completedAt || r.distanceMeters == null) continue;
          swims++;
          meters += r.distanceMeters;
          ms += new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime();
        }
        setMyStats({
          swims,
          km: Math.round(meters / 100) / 10,
          hrs: Math.round(ms / 360000) / 10,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, tab]);

  if (!started) {
    return (
      <>
        <FluidCursor />
        <IntroPage onStart={() => setStarted(true)} />
      </>
    );
  }

  // After "Start", you must be signed in to use the app.
  if (authLoading) {
    return (
      <>
        <FluidCursor />
        <div className="app-booting">
          <SwimmerAvatar
            character={{ id: "load", name: "", skin: "#f3c89e", suit: "#a855f7", cap: "#6d28d9", modelUrl: "" }}
            pose="swim"
            size={64}
          />
          <p>Warming up the pool…</p>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <FluidCursor />
        <AuthScreen />
      </>
    );
  }

  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app-shell">
      <FluidCursor />
      <SwimSchool count={7} seed={21} fixed className="app-bg-school" />

      {/* ------------------------------ sidebar ------------------------------ */}
      <aside className="sidebar glass-surface" data-glass>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">🏊</span>
          <span className="sidebar-brand-name">UBC Length Swim</span>
        </div>

        <div className="sidebar-profile">
          <span className="sidebar-avatar">
            {user.photoUrl ? (
              <img src={user.photoUrl} alt="" />
            ) : (
              <SwimmerAvatar character={userCharacter(user)} pose="stand" size={64} />
            )}
          </span>
          <h2 className="sidebar-name">{user.displayName}</h2>
          <p className="sidebar-role">Swimmer</p>
          <div className="sidebar-stats">
            <span>
              <em>Swims</em>
              <strong>{myStats.swims}</strong>
            </span>
            <span>
              <em>Km</em>
              <strong>{myStats.km}</strong>
            </span>
            <span>
              <em>Hrs</em>
              <strong>{myStats.hrs}</strong>
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`sidebar-nav-item ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="sidebar-nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="sidebar-logout" onClick={() => logout()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* ------------------------------ main ------------------------------ */}
      <main className="app-main">
        <header className="page-head">
          <div>
            <h1 className="page-title">{activeTab.title}</h1>
            <p className="page-sub">{activeTab.sub}</p>
          </div>
          <div className="page-head-actions">
            <NotificationBell
              onGoToFriends={() => setTab("friends")}
              onOpenChat={openChat}
              onOpenProfile={openProfile}
            />
          </div>
        </header>

        {tab === "schedule" && (
        <>
          {lastUpdated && (
            <p className="updated-at">Last updated {new Date(lastUpdated).toLocaleString()}</p>
          )}

          <div className="filters">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={`chip glass-surface ${filter === f.value ? "active" : ""}`}
                data-glass
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
            <button
              className="refresh-button glass-surface"
              data-glass
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {loading && <p className="empty-state">Loading schedule…</p>}
          {error && <p className="error-state">⚠️ {error}</p>}
          {!loading && !error && <AquaticCenterSchedule events={events} filter={filter} />}
        </>
      )}

        {tab === "pool" && <PoolView events={events} user={user} />}

        {tab === "friends" && (
          <FriendsView
            events={events}
            user={user}
            initialChatUserId={pendingChatUserId}
            onInitialChatConsumed={() => setPendingChatUserId(null)}
            onOpenProfile={openProfile}
          />
        )}

        {tab === "ranking" && <Leaderboard onOpenProfile={openProfile} />}

        {tab === "records" && <RecordsView />}

        {tab === "coach" && <CoachView />}
      </main>

      {profileUserId !== null && (
        <UserProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onOpenChat={(u) => openChat(u.id)}
        />
      )}
    </div>
  );
}

export default App;
