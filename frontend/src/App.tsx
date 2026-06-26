import { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./components/PoolView.css";
import "./components/RecordsView.css";
import { fetchSchedule, refreshSchedule } from "./api";
import PoolView from "./components/PoolView";
import ScheduleView from "./components/ScheduleView";
import RecordsView from "./components/RecordsView";
import FluidCursor from "./components/FluidCursor";
import type { PoolFilter, SwimEvent } from "./types";

type Tab = "schedule" | "pool" | "records";

const FILTERS: { value: PoolFilter; label: string }[] = [
  { value: "all", label: "All Pools" },
  { value: "25m", label: "25m only" },
  { value: "50m", label: "50m only" },
];

function App() {
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

  return (
    <div className="app">
      <FluidCursor />
      <header className="app-header glass-surface" data-glass>
        <div className="brand">
          <h1>🏊 UBC Length Swim</h1>
          <p className="tagline">Schedule + Pool Tracker</p>
        </div>
        {tab === "schedule" && (
          <button
            className="refresh-button glass-surface"
            data-glass
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        )}
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
          </div>

          {loading && <p className="empty-state">Loading schedule…</p>}
          {error && <p className="error-state">⚠️ {error}</p>}
          {!loading && !error && <ScheduleView events={events} filter={filter} />}
        </>
      )}

      {tab === "pool" && <PoolView events={events} />}

      {tab === "records" && <RecordsView />}
    </div>
  );
}

export default App;
