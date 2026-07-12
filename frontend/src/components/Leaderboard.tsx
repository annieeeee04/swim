import { useEffect, useState } from "react";
import { fetchTodayLeaderboard } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { Character } from "../data/characters";
import type { LeaderboardEntry } from "../types";
import SwimmerAvatar from "./SwimmerAvatar";

function entryCharacter(e: LeaderboardEntry): Character {
  return { id: "lb", name: e.displayName, skin: e.avatarSkin, suit: e.avatarSuit, cap: e.avatarCap, modelUrl: "" };
}

/**
 * Round profile chip: uploaded photo if present, else the 2D swimmer avatar.
 * Real users (not demo seeds, not yourself) are clickable → profile card.
 */
function Face({
  entry,
  size,
  onOpen,
}: {
  entry: LeaderboardEntry;
  size: number;
  onOpen?: () => void;
}) {
  const chip = (
    <span className="lb-face" style={{ width: size, height: size }}>
      {entry.photoUrl ? (
        <img src={entry.photoUrl} alt="" />
      ) : (
        <SwimmerAvatar character={entryCharacter(entry)} pose="stand" size={Math.round(size * 0.74)} />
      )}
    </span>
  );
  if (!onOpen) return chip;
  return (
    <button className="lb-face-btn" onClick={onOpen} title={`View ${entry.displayName}'s profile`}>
      {chip}
    </button>
  );
}

function PodiumSpot({
  entry,
  place,
  isMe,
  onOpen,
}: {
  entry: LeaderboardEntry;
  place: 1 | 2 | 3;
  isMe: boolean;
  onOpen?: () => void;
}) {
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  return (
    <div className={`lb-podium-spot lb-place-${place} ${isMe ? "is-me" : ""}`}>
      <div className="lb-podium-face-wrap">
        <span className="lb-medal" aria-hidden="true">{medal}</span>
        <Face entry={entry} size={place === 1 ? 92 : 72} onOpen={onOpen} />
      </div>
      <span className="lb-podium-name">
        {entry.displayName}
        {isMe && <span className="lb-you-tag">YOU</span>}
      </span>
      <span className="lb-podium-meters">{Math.round(entry.totalMeters)}m</span>
      <div className="lb-podium-bar">
        <span className="lb-podium-rank">{place}</span>
      </div>
    </div>
  );
}

export default function Leaderboard({
  onOpenProfile,
}: {
  /** Tap a real swimmer's face to view their profile (message / add friend / invite). */
  onOpenProfile?: (userId: number) => void;
}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchTodayLeaderboard()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the ranking.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isMe = (e: LeaderboardEntry) => user != null && e.userId === user.id;

  /** Clickable only for real, other users — demo seeds have nothing to show. */
  const openFor = (e: LeaderboardEntry) =>
    onOpenProfile && e.userId != null && !e.demo && !isMe(e)
      ? () => onOpenProfile(e.userId!)
      : undefined;

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  // Podium display order: 2nd, 1st, 3rd (winner in the middle).
  const podiumOrder: { entry: LeaderboardEntry; place: 1 | 2 | 3 }[] = [];
  if (top3[1]) podiumOrder.push({ entry: top3[1], place: 2 });
  if (top3[0]) podiumOrder.push({ entry: top3[0], place: 1 });
  if (top3[2]) podiumOrder.push({ entry: top3[2], place: 3 });

  return (
    <div className="leaderboard">
      <div className="lb-hero glass-surface" data-glass>
        <span className="lb-eyebrow">Today at the Aquatic Centre</span>
        <h2 className="lb-title">🏆 Today's Ranking</h2>
        <p className="lb-sub">Most metres swum today. Keep logging laps to climb the board!</p>
      </div>

      {loading && <p className="empty-state">Loading the ranking…</p>}
      {error && <p className="error-state">⚠️ {error}</p>}

      {!loading && !error && (
        <>
          <div className="lb-podium">
            {podiumOrder.map(({ entry, place }) => (
              <PodiumSpot
                key={`${entry.userId ?? "demo"}-${entry.displayName}`}
                entry={entry}
                place={place}
                isMe={isMe(entry)}
                onOpen={openFor(entry)}
              />
            ))}
          </div>

          {rest.length > 0 && (
            <ol className="lb-list">
              {rest.map((e) => {
                const open = openFor(e);
                return (
                  <li
                    key={`${e.userId ?? "demo"}-${e.displayName}-${e.rank}`}
                    className={`lb-row glass-surface ${isMe(e) ? "is-me" : ""} ${open ? "lb-row-clickable" : ""}`}
                    data-glass
                    onClick={open}
                    role={open ? "button" : undefined}
                    tabIndex={open ? 0 : undefined}
                    onKeyDown={open ? (ev) => ev.key === "Enter" && open() : undefined}
                  >
                    <span className="lb-row-rank">{e.rank}</span>
                    <Face entry={e} size={40} />
                    <span className="lb-row-name">
                      {e.displayName}
                      {isMe(e) && <span className="lb-you-tag">YOU</span>}
                    </span>
                    <span className="lb-row-swims">{e.swims} swims</span>
                    <span className="lb-row-meters">{Math.round(e.totalMeters)}m</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
