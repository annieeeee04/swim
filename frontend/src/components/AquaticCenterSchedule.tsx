import { lazy, Suspense, useMemo, useState } from "react";
import type { PoolFilter, SwimEvent } from "../types";
import { buildZoneSchedule, dayKeyOf, isFiftyMeter, listDays } from "../utils/poolZones";
import type { ZoneLayout } from "./AquaticCenterScene";
import { formatDayHeading, formatTime } from "../utils/time";
import DayCalendarPicker from "./DayCalendarPicker";

// Same lazy-loaded three.js chunk pattern the Pool tab already uses.
const AquaticCenterScene = lazy(() => import("./AquaticCenterScene"));

const INLINE_PREVIEW = 2;

function poolEmoji(facilityName: string): string {
  const name = facilityName.toLowerCase();
  if (name.includes("recreation")) return "🔵";
  if (name.includes("leisure")) return "🟢";
  if (name.includes("competition") || name.includes("comp")) return "🟣";
  if (name.includes("hot tub")) return "🟠";
  return "📍";
}

function applyPoolFilter(events: SwimEvent[], filter: PoolFilter): SwimEvent[] {
  return events.filter((ev) => {
    const fifty = isFiftyMeter(ev);
    if (filter === "25m") return !fifty;
    if (filter === "50m") return fifty;
    return true;
  });
}

export default function AquaticCenterSchedule({
  events,
  filter,
}: {
  events: SwimEvent[];
  filter: PoolFilter;
}) {
  const days = useMemo(() => listDays(events), [events]);
  const todayKey = useMemo(() => dayKeyOf(new Date().toISOString().slice(0, 10) + " 00:00:00"), []);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : days.find((d) => d >= todayKey) ?? days[0] ?? null;

  const [activeZoneKey, setActiveZoneKey] = useState<string | null>(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState<string | null>(null);

  const dayEvents = useMemo(
    () => applyPoolFilter(events.filter((ev) => dayKeyOf(ev.start) === activeDay), filter),
    [events, filter, activeDay],
  );

  const { byZone, zoneInfo } = useMemo(() => buildZoneSchedule(dayEvents), [dayEvents]);

  const zones: ZoneLayout[] = useMemo(() => {
    const hasSplit = Boolean(zoneInfo["comp-north"] || zoneInfo["comp-south"]);
    const base: Omit<ZoneLayout, "count">[] = [
      { key: "recreation", label: "Recreation Pool", poolLength: 25, shape: "rect", x: -3.6, z: -1.6, width: 3.4, depth: 2.6 },
      ...(hasSplit
        ? [
            { key: "comp-north", label: "Competition Pool — North", poolLength: 50 as const, shape: "rect" as const, x: 1.8, z: -1.3, width: 5.6, depth: 2.3 },
            { key: "comp-south", label: "Competition Pool — South", poolLength: 50 as const, shape: "rect" as const, x: 1.8, z: 1.3, width: 5.6, depth: 2.3 },
          ]
        : [{ key: "comp", label: "Competition Pool", poolLength: 50 as const, shape: "rect" as const, x: 1.8, z: 0, width: 5.6, depth: 5.0 }]),
      { key: "leisure", label: "Leisure Pool", poolLength: null, shape: "ellipse", x: -3.4, z: 1.8, width: 3.0, depth: 2.2 },
    ];
    if (zoneInfo["hot-tub"]) {
      base.push({ key: "hot-tub", label: "Hot Tub", poolLength: null, shape: "ellipse", x: -1.0, z: 2.6, width: 1.0, depth: 1.0 });
    }
    let otherIndex = 0;
    for (const [key, info] of Object.entries(zoneInfo)) {
      if (!key.startsWith("other:")) continue;
      base.push({ key, label: info.label, poolLength: null, shape: "rect", x: 4.8 + otherIndex * 1.4, z: 2.6, width: 1.2, depth: 1.0 });
      otherIndex++;
    }
    return base.map((z) => ({ ...z, count: zoneInfo[z.key]?.count ?? 0 }));
  }, [zoneInfo]);

  const selectedSessions = selectedZoneKey !== null ? byZone.get(selectedZoneKey) ?? [] : [];
  const selectedLabel = selectedZoneKey !== null ? zoneInfo[selectedZoneKey]?.label ?? selectedZoneKey : "";

  return (
    <div className="aquatic-schedule">
      <DayCalendarPicker days={days} activeDay={activeDay} onSelectDay={setSelectedDay} />

      {days.length === 0 && <p className="empty-state">No sessions in the schedule right now.</p>}

      {activeDay && (
        <div className="aquatic-layout">
          <div className="aquatic-stage">
            <Suspense fallback={<div className="pool3d-loading">Loading map…</div>}>
              <AquaticCenterScene zones={zones} activeZoneKey={activeZoneKey} onPickZone={(key) => setSelectedZoneKey(key)} />
            </Suspense>
          </div>

          <ul className="zone-cards">
            {zones.map((zone) => {
              const sessions = byZone.get(zone.key) ?? [];
              const preview = sessions.slice(0, INLINE_PREVIEW);
              const overflow = sessions.length - preview.length;
              return (
                <li
                  key={zone.key}
                  className={`zone-card glass-surface ${selectedZoneKey === zone.key ? "is-selected" : ""}`}
                  data-glass
                  onMouseEnter={() => setActiveZoneKey(zone.key)}
                  onMouseLeave={() => setActiveZoneKey(null)}
                >
                  <div className="zone-card-header">
                    <span className={`zone-dot ${zone.poolLength === 50 ? "fifty" : zone.poolLength === 25 ? "twentyfive" : "other"}`} />
                    <h4>{zone.label}</h4>
                  </div>

                  {sessions.length === 0 ? (
                    <span className="zone-card-empty">No sessions today</span>
                  ) : (
                    <>
                      <div className="zone-card-chips">
                        {preview.map((ev) => (
                          <span key={ev.eventId} className="zone-chip">
                            {formatTime(ev.start)} · {isFiftyMeter(ev) ? "50m" : "25m"}
                          </span>
                        ))}
                      </div>
                      {overflow > 0 ? (
                        <button className="zone-card-more" onClick={() => setSelectedZoneKey(zone.key)}>
                          +{overflow} more
                        </button>
                      ) : (
                        <button className="zone-card-more zone-card-more-ghost" onClick={() => setSelectedZoneKey(zone.key)}>
                          View all
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedZoneKey !== null && (
        <>
          <div className="zone-panel-overlay" onClick={() => setSelectedZoneKey(null)} />
          <aside className="zone-panel glass-surface" data-glass>
            <div className="zone-panel-header">
              <h3>{selectedLabel}</h3>
              <button className="zone-panel-close" onClick={() => setSelectedZoneKey(null)} aria-label="Close">
                ✕
              </button>
            </div>
            {activeDay && <p className="zone-panel-day">{formatDayHeading(activeDay)}</p>}
            {selectedSessions.length === 0 ? (
              <p className="zone-panel-empty">No sessions scheduled here today.</p>
            ) : (
              <ul className="zone-panel-list">
                {selectedSessions.map((ev) => (
                  <li key={ev.eventId} className="zone-panel-item">
                    <span className="zone-panel-time">
                      {formatTime(ev.start)}–{formatTime(ev.end)}
                    </span>
                    <span className="zone-panel-pool">
                      {poolEmoji(ev.facilityName)} {ev.facilityName}
                    </span>
                    <span className="zone-panel-length">{isFiftyMeter(ev) ? "50m" : "25m"}</span>
                    {ev.curl && (
                      <a className="zone-panel-book" href={ev.curl} target="_blank" rel="noopener noreferrer">
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
