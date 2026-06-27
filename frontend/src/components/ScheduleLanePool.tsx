import { lazy, Suspense, useMemo, useState } from "react";
import type { PoolFilter, SwimEvent } from "../types";
import { buildLaneSchedule, isFiftyMeter } from "../utils/laneSchedule";
import { formatDayHeading, formatTime } from "../utils/time";

// Same lazy-loaded three.js chunk the Pool tab already uses.
const Pool3D = lazy(() => import("./Pool3D"));

const LANES_COUNT = 10;
const INLINE_PREVIEW = 2;

function poolEmoji(facilityName: string): string {
  const name = facilityName.toLowerCase();
  if (name.includes("recreation")) return "🔵";
  if (name.includes("leisure")) return "🟢";
  if (name.includes("competition") || name.includes("comp")) return "🟣";
  return "📍";
}

function filterEvents(events: SwimEvent[], filter: PoolFilter): SwimEvent[] {
  return events.filter((ev) => {
    const fifty = isFiftyMeter(ev);
    if (filter === "25m") return !fifty;
    if (filter === "50m") return fifty;
    return true;
  });
}

export default function ScheduleLanePool({
  events,
  filter,
}: {
  events: SwimEvent[];
  filter: PoolFilter;
}) {
  const [hoveredLane, setHoveredLane] = useState<number | null>(null);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);

  const { byLane, laneInfo } = useMemo(
    () => buildLaneSchedule(filterEvents(events, filter), LANES_COUNT),
    [events, filter],
  );

  const selectedSessions = selectedLane !== null ? (byLane.get(selectedLane) ?? []) : [];

  return (
    <div className="lane-pool">
      <div className="lane-pool-stage">
        <Suspense fallback={<div className="pool3d-loading">Loading pool…</div>}>
          <Pool3D
            lanesCount={LANES_COUNT}
            activeLane={hoveredLane}
            laneInfo={laneInfo}
            onPickLane={(lane) => setSelectedLane(lane)}
          />
        </Suspense>
      </div>

      <ul className="lane-rows">
        {Array.from({ length: LANES_COUNT }, (_, i) => i + 1).map((lane) => {
          const sessions = byLane.get(lane) ?? [];
          const info = laneInfo[lane];
          const preview = sessions.slice(0, INLINE_PREVIEW);
          const overflow = sessions.length - preview.length;
          return (
            <li
              key={lane}
              className={`lane-row glass-surface ${selectedLane === lane ? "is-selected" : ""}`}
              data-glass
              onMouseEnter={() => setHoveredLane(lane)}
              onMouseLeave={() => setHoveredLane(null)}
            >
              <span className={`lane-row-badge ${info.has25 && info.has50 ? "mixed" : info.has50 ? "fifty" : "twentyfive"}`}>
                {lane}
              </span>

              {sessions.length === 0 ? (
                <span className="lane-row-empty">No sessions</span>
              ) : (
                <>
                  <div className="lane-row-chips">
                    {preview.map((ev) => (
                      <span key={ev.eventId} className="lane-chip">
                        {formatTime(ev.start)} · {isFiftyMeter(ev) ? "50m" : "25m"}
                      </span>
                    ))}
                  </div>
                  {overflow > 0 && (
                    <button className="lane-row-more" onClick={() => setSelectedLane(lane)}>
                      +{overflow} more
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {selectedLane !== null && (
        <>
          <div className="lane-panel-overlay" onClick={() => setSelectedLane(null)} />
          <aside className="lane-panel glass-surface" data-glass>
            <div className="lane-panel-header">
              <h3>Lane {selectedLane}</h3>
              <button className="lane-panel-close" onClick={() => setSelectedLane(null)} aria-label="Close">
                ✕
              </button>
            </div>
            {selectedSessions.length === 0 ? (
              <p className="lane-panel-empty">No sessions scheduled for this lane.</p>
            ) : (
              <ul className="lane-panel-list">
                {selectedSessions.map((ev) => (
                  <li key={ev.eventId} className="lane-panel-item">
                    <span className="lane-panel-day">{formatDayHeading(ev.start.slice(0, 10))}</span>
                    <span className="lane-panel-time">
                      {formatTime(ev.start)}–{formatTime(ev.end)}
                    </span>
                    <span className="lane-panel-pool">
                      {poolEmoji(ev.facilityName)} {ev.facilityName}
                    </span>
                    <span className="lane-panel-length">{isFiftyMeter(ev) ? "50m" : "25m"}</span>
                    {ev.curl && (
                      <a className="lane-panel-book" href={ev.curl} target="_blank" rel="noopener noreferrer">
                        Details
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
