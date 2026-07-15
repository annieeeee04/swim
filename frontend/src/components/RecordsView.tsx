import { useEffect, useMemo, useState } from "react";
import { deleteSwimRecord, fetchSwimHistory, finishSwim } from "../api";
import { CHARACTERS, type Character } from "../data/characters";
import { useAuth } from "../auth/AuthContext";
import SwimmerAvatar from "./SwimmerAvatar";
import SwimSchool from "./SwimSchool";
import type { SwimRecord, User } from "../types";
import type { BodyShape, HairStyle, SuitStyle } from "../utils/generateAvatar";

function characterFor(id: string) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

/** The avatar shown for a record: the user's own look for their swims,
 *  otherwise the roster character that was used. */
function displayCharacterFor(record: SwimRecord, user: User | null): Character {
  if (user && record.userId === user.id) {
    return {
      id: `me-${user.id}`,
      name: user.displayName,
      skin: user.avatarSkin ?? "#f3c89e",
      suit: user.avatarSuit ?? "#ec4899",
      cap: user.avatarCap ?? "#a855f7",
      modelUrl: "",
    };
  }
  return characterFor(record.character);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "In progress";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/* ─── per-card action widget ─────────────────────────────────────────── */

type CardMode = "idle" | "ending" | "confirm-delete";

function RecordCard({
  record,
  user,
  onUpdated,
  onDeleted,
}: {
  record: SwimRecord;
  user: User | null;
  onUpdated: (r: SwimRecord) => void;
  onDeleted: (id: number) => void;
}) {
  const character = displayCharacterFor(record, user);
  const done = record.completedAt != null;

  const [mode, setMode] = useState<CardMode>("idle");
  const [distance, setDistance] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleEnd() {
    const meters = parseFloat(distance);
    if (isNaN(meters) || meters < 0) {
      setErr("Enter a valid distance (e.g. 1500).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const updated = await finishSwim(record.id, meters);
      onUpdated(updated);
      setMode("idle");
      setDistance("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setErr(null);
    try {
      await deleteSwimRecord(record.id);
      onDeleted(record.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete.");
      setBusy(false);
      setMode("idle");
    }
  }

  return (
    <div className={`record-card glass-panel ${mode !== "idle" ? "record-card-active" : ""}`} data-glass>
      <div className="record-card-top">
        <SwimmerAvatar
          character={character}
          pose="stand"
          size={40}
          bodyShape={(user?.avatarBodyShape as BodyShape | null) ?? "athletic"}
          hairStyle={(user?.avatarHairStyle as HairStyle | null) ?? "short"}
          hairColor={user?.avatarHairColor ?? undefined}
          suitStyle={(user?.avatarSuitStyle as SuitStyle | null) ?? "classic"}
        />
        <span className={`record-status ${done ? "record-status-done" : "record-status-live"}`}>
          {done ? "Completed" : "In Progress"}
        </span>
      </div>

      <h3 className="record-character-name">{character.name}</h3>

      <div className="record-meta">
        <span className="record-chip">{record.poolLength}m pool</span>
        <span className="record-chip">Lane {record.lane}</span>
      </div>

      <p className="record-distance">
        {record.distanceMeters != null ? `${record.distanceMeters}m` : "—"}
      </p>
      <p className="record-time">{formatDateTime(record.startedAt)}</p>
      <p className="record-duration">⏱ {formatDuration(record.startedAt, record.completedAt)}</p>

      {/* ── action area ── */}
      {mode === "idle" && (
        <div className="record-actions">
          {!done && (
            <button
              className="record-btn record-btn-end"
              onClick={() => setMode("ending")}
            >
              End swim
            </button>
          )}
          <button
            className="record-btn record-btn-delete"
            onClick={() => setMode("confirm-delete")}
            aria-label="Delete record"
          >
            🗑
          </button>
        </div>
      )}

      {mode === "ending" && (
        <div className="record-end-form">
          <label className="record-end-label">How far did you swim?</label>
          <div className="record-end-row">
            <input
              className="record-end-input"
              type="number"
              min="0"
              step="25"
              placeholder="e.g. 1500"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEnd()}
              autoFocus
            />
            <span className="record-end-unit">m</span>
          </div>
          {err && <p className="record-action-err">{err}</p>}
          <div className="record-action-btns">
            <button className="record-btn record-btn-confirm" onClick={handleEnd} disabled={busy}>
              {busy ? "Saving…" : "Save & end"}
            </button>
            <button className="record-btn record-btn-cancel" onClick={() => { setMode("idle"); setErr(null); setDistance(""); }} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "confirm-delete" && (
        <div className="record-confirm-delete">
          <p className="record-confirm-text">Delete this record?</p>
          {err && <p className="record-action-err">{err}</p>}
          <div className="record-action-btns">
            <button className="record-btn record-btn-confirm-del" onClick={handleDelete} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button className="record-btn record-btn-cancel" onClick={() => { setMode("idle"); setErr(null); }} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── main view ─────────────────────────────────────────────────────── */

export default function RecordsView() {
  const { user } = useAuth();
  const [records, setRecords] = useState<SwimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSwimHistory();
        if (!cancelled) {
          setRecords([...data].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load records.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleUpdated(updated: SwimRecord) {
    setRecords((prev) =>
      [...prev.map((r) => (r.id === updated.id ? updated : r))].sort(
        (a, b) => b.startedAt.localeCompare(a.startedAt),
      ),
    );
  }

  function handleDeleted(id: number) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  const stats = useMemo(() => {
    const completed = records.filter((r) => r.distanceMeters != null);
    const totalDistance = completed.reduce((sum, r) => sum + (r.distanceMeters ?? 0), 0);
    const longest = completed.reduce(
      (best, r) => ((r.distanceMeters ?? 0) > (best?.distanceMeters ?? 0) ? r : best),
      completed[0],
    );
    const favoriteCounts = new Map<string, number>();
    for (const r of records) {
      favoriteCounts.set(r.character, (favoriteCounts.get(r.character) ?? 0) + 1);
    }
    let favorite: string | null = null;
    let favoriteCount = 0;
    for (const [id, count] of favoriteCounts) {
      if (count > favoriteCount) { favorite = id; favoriteCount = count; }
    }
    return {
      totalSwims: records.length,
      totalDistance,
      longest,
      favorite: favorite ? characterFor(favorite) : null,
    };
  }, [records]);

  return (
    <div className="records-view">
      <div className="records-blob records-blob-a" aria-hidden="true" />
      <div className="records-blob records-blob-b" aria-hidden="true" />
      <div className="records-blob records-blob-c" aria-hidden="true" />
      <SwimSchool count={5} seed={42} className="records-school" />

      <div className="records-hero glass-panel" data-glass>
        <p className="records-eyebrow">Your Lane, Your Legacy</p>
        <h2 className="records-title">Swim Records</h2>
        <p className="records-subtitle">Every lap, every lane, tracked and stacked.</p>
      </div>

      {loading && <p className="empty-state">Loading your records…</p>}
      {error && <p className="error-state">⚠️ {error}</p>}

      {!loading && !error && (
        <>
          <div className="records-stats">
            <div className="stat-card glass-panel" data-glass>
              <span className="stat-value">{stats.totalSwims}</span>
              <span className="stat-label">Total Swims</span>
            </div>
            <div className="stat-card glass-panel" data-glass>
              <span className="stat-value">{stats.totalDistance}m</span>
              <span className="stat-label">Distance Logged</span>
            </div>
            <div className="stat-card glass-panel" data-glass>
              <span className="stat-value">{stats.longest?.distanceMeters ?? "—"}m</span>
              <span className="stat-label">Longest Swim</span>
            </div>
            <div className="stat-card glass-panel stat-card-favorite" data-glass>
              {stats.favorite ? (
                <>
                  <SwimmerAvatar character={stats.favorite} pose="stand" size={34} />
                  <span className="stat-label">Top Swimmer</span>
                </>
              ) : (
                <span className="stat-label">No swims yet</span>
              )}
            </div>
          </div>

          {records.length === 0 ? (
            <p className="empty-state">
              No swim records yet — head to the Pool tab to log your first lap! 🏊
            </p>
          ) : (
            <div className="records-grid">
              {records.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  user={user}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
