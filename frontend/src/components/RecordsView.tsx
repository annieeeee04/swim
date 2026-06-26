import { useEffect, useMemo, useState } from "react";
import { fetchSwimHistory } from "../api";
import { CHARACTERS } from "../data/characters";
import SwimmerAvatar from "./SwimmerAvatar";
import type { SwimRecord } from "../types";

function characterFor(id: string) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
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

export default function RecordsView() {
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
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (count > favoriteCount) {
        favorite = id;
        favoriteCount = count;
      }
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
              {records.map((r) => {
                const character = characterFor(r.character);
                const done = r.completedAt != null;
                return (
                  <div key={r.id} className="record-card glass-panel" data-glass>
                    <div className="record-card-top">
                      <SwimmerAvatar character={character} pose="stand" size={40} />
                      <span className={`record-status ${done ? "record-status-done" : "record-status-live"}`}>
                        {done ? "Completed" : "In Progress"}
                      </span>
                    </div>
                    <h3 className="record-character-name">{character.name}</h3>
                    <div className="record-meta">
                      <span className="record-chip">{r.poolLength}m pool</span>
                      <span className="record-chip">Lane {r.lane}</span>
                    </div>
                    <p className="record-distance">
                      {r.distanceMeters != null ? `${r.distanceMeters}m` : "—"}
                    </p>
                    <p className="record-time">{formatDateTime(r.startedAt)}</p>
                    <p className="record-duration">⏱ {formatDuration(r.startedAt, r.completedAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
