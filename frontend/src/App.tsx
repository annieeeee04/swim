import { useCallback, useEffect, useState } from "react";
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
import { fetchSchedule, refreshSchedule } from "./api";
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
import SwimmerAvatar from "./components/SwimmerAvatar";
import type { Character } from "./data/characters";
import type { PoolFilter, SwimEvent, User } from "./types";

type Tab = "schedule" | "pool" | "friends" | "records" | "ranking";

const FILTERS: { value: PoolFilter; label: string }[] = [
  { value: "all", label: "All Pools" },
  { value: "25m", label: "25m only" },
  { value: "50m", label: "50m only" },
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

  return (
    <div className="app">
      <FluidCursor />
      <SwimSchool count={7} seed={21} fixed className="app-bg-school" />
      <header className="app-header glass-surface" data-glass>
        <div className="brand">
          <h1>
            <span className="brand-emoji">🏊</span> UBC Length Swim
          </h1>
          <p className="tagline">Schedule + Pool Tracker</p>
        </div>

        <div className="user-chip">
          <NotificationBell onGoToFriends={() => setTab("friends")} />
          <span className="user-chip-avatar">
            {user.photoUrl ? (
              <img src={user.photoUrl} alt="" />
            ) : (
              <SwimmerAvatar character={userCharacter(user)} pose="stand" size={26} />
            )}
          </span>
          <span className="user-chip-name">{user.displayName}</span>
          <button className="user-chip-logout" onClick={() => logout()} title="Sign out">
            ⏻
          </button>
        </div>
      </header>

      <div className="tabs glass-surface" data-glass>
        <button
          className={`tab ${tab === "schedule" ? "active" : ""}`}
          onClick={() => setTab("schedule")}
        >
          Schedule
        </button>
        <button className={`tab ${tab === "pool" ? "active" : ""}`} onClick={() => setTab("pool")}>
          Pool
        </button>
        <button
          className={`tab ${tab === "friends" ? "active" : ""}`}
          onClick={() => setTab("friends")}
        >
          Friends
        </button>
        <button
          className={`tab ${tab === "ranking" ? "active" : ""}`}
          onClick={() => setTab("ranking")}
        >
          Ranking
        </button>
        <button
          className={`tab ${tab === "records" ? "active" : ""}`}
          onClick={() => setTab("records")}
        >
          My Records
        </button>
      </div>

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

      {tab === "friends" && <FriendsView events={events} user={user} />}

      {tab === "ranking" && <Leaderboard />}

      {tab === "records" && <RecordsView />}
    </div>
  );
}

export default App;
