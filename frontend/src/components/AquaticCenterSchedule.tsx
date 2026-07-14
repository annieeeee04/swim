import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { PoolFilter, SwimEvent } from "../types";
import { buildZoneSchedule, dayKeyOf, isFiftyMeter, listDays } from "../utils/poolZones";
import type { TourCamera, ZoneLayout } from "./AquaticCenterScene";
import { formatDayHeading, formatTime } from "../utils/time";
import DayCalendarPicker from "./DayCalendarPicker";

// Same lazy-loaded three.js chunk pattern the Pool tab already uses.
const AquaticCenterScene = lazy(() => import("./AquaticCenterScene"));

const INLINE_PREVIEW = 2;

/** The official Klapty 360° photo tour of the UBC Aquatic Centre. */
const KLAPTY_TOUR_URL = "https://tour.klapty.com/hrK0IMVEyT";

/** Guided-tour stops through the 3D facility, Klapty-style. */
interface TourStop extends TourCamera {
  title: string;
  text: string;
}

const TOUR_STOPS: TourStop[] = [
  {
    key: "welcome",
    title: "Welcome to the Aquatic Centre",
    text: "Standing at the entrance. Drag to look around — the whole natatorium is ahead of you.",
    position: [-7.4, 1.7, 3.9],
    lookAt: [0.5, 0.3, -0.5],
  },
  {
    key: "recreation",
    title: "Recreation Pool · 25m",
    text: "Eight lanes, 4.5m deep end with the diving tower. Most 25m Length Swim sessions happen here.",
    position: [-4.0, 1.6, 0.6],
    lookAt: [-4.0, 0.1, -2.4],
  },
  {
    key: "leisure",
    title: "Leisure Pool",
    text: "Warm water, fountains, basketball hoops and the kids' play island — plus the warm corner pool.",
    position: [-1.6, 1.6, 3.8],
    lookAt: [-4.4, 0.1, 1.5],
  },
  {
    key: "hot-tub",
    title: "Hot Tub",
    text: "The warm-down corner between the pools. Ledge seats, jets, and the aquatic lift for accessibility.",
    position: [-2.6, 1.4, 2.2],
    lookAt: [-1.6, 0.15, 0.3],
  },
  {
    key: "competition",
    title: "Competition Pool · 50m",
    text: "The Olympic-size pool with starting blocks and 10 lanes. 50m Length Swim lives here.",
    position: [-1.3, 1.7, 2.8],
    lookAt: [2.2, 0.1, -0.4],
  },
  {
    key: "stands",
    title: "Spectator View",
    text: "The mezzanine perspective — on meet days up to 460 spectators watch from up here.",
    position: [1.6, 4.6, 4.3],
    lookAt: [1.2, 0, -0.8],
  },
];

function poolEmoji(facilityName: string | null | undefined): string {
  const name = (facilityName ?? "").toLowerCase();
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
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // Guided 3D tour (null = off) + embedded Klapty 360° photo tour.
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [photoTourOpen, setPhotoTourOpen] = useState(false);
  const touring = tourIndex !== null;
  const tourStop = touring ? TOUR_STOPS[tourIndex] : null;

  // Keyboard navigation while touring: ← → to move, Esc to exit.
  useEffect(() => {
    if (!touring) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTourIndex(null);
      else if (e.key === "ArrowRight")
        setTourIndex((i) => (i === null ? null : Math.min(i + 1, TOUR_STOPS.length - 1)));
      else if (e.key === "ArrowLeft") setTourIndex((i) => (i === null ? null : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [touring]);

  const dayEvents = useMemo(
    () => applyPoolFilter(events.filter((ev) => dayKeyOf(ev.start) === activeDay), filter),
    [events, filter, activeDay],
  );

  const { byZone, zoneInfo } = useMemo(() => buildZoneSchedule(dayEvents), [dayEvents]);

  // Positions mirror the real UBC Aquatic Centre floor plan: change rooms +
  // front desk along the left wall, the 25m Recreation Pool stacked above
  // the Leisure Pool (with the Hot Tub nested into the corner between them),
  // and the 50m Competition Pool spanning the full height on the right.
  const zones: ZoneLayout[] = useMemo(() => {
    const hasSplit = Boolean(zoneInfo["comp-north"] || zoneInfo["comp-south"]);
    const base: Omit<ZoneLayout, "count">[] = [
      { key: "recreation", label: "Recreation Pool", poolLength: 25, shape: "rect", x: -4.0, z: -1.8, width: 3.0, depth: 3.2 },
      ...(hasSplit
        ? [
            { key: "comp-north", label: "Competition Pool — North", poolLength: 50 as const, shape: "rect" as const, x: 1.6, z: -1.75, width: 4.4, depth: 3.2 },
            { key: "comp-south", label: "Competition Pool — South", poolLength: 50 as const, shape: "rect" as const, x: 1.6, z: 1.75, width: 4.4, depth: 3.2 },
          ]
        : [{ key: "comp", label: "Competition Pool", poolLength: 50 as const, shape: "rect" as const, x: 1.6, z: 0, width: 4.4, depth: 6.6 }]),
      { key: "leisure", label: "Leisure Pool", poolLength: null, shape: "leisure", x: -4.0, z: 1.7, width: 2.8, depth: 2.4 },
    ];
    if (zoneInfo["hot-tub"]) {
      base.push({ key: "hot-tub", label: "Hot Tub", poolLength: null, shape: "ellipse", x: -1.7, z: 0.4, width: 0.9, depth: 0.9 });
    }
    let otherIndex = 0;
    for (const [key, info] of Object.entries(zoneInfo)) {
      if (!key.startsWith("other:")) continue;
      base.push({ key, label: info.label, poolLength: null, shape: "rect", x: 4.4 + otherIndex * 1.4, z: 3.6, width: 1.2, depth: 1.0 });
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
          <div className="aquatic-stage-wrap">
            <div className="aquatic-stage">
              <Suspense fallback={<div className="pool3d-loading">Loading map…</div>}>
                <AquaticCenterScene
                  zones={zones}
                  activeZoneKey={activeZoneKey}
                  focusZoneKey={selectedZoneKey}
                  onPickZone={(key) => setSelectedZoneKey(key)}
                  onHoverZone={(key) => setActiveZoneKey(key)}
                  tourStop={tourStop}
                />
              </Suspense>
            </div>

            {/* virtual-tour entry points */}
            <div className="tour-buttons">
              {!touring && (
                <button
                  type="button"
                  className="tour-btn glass-surface"
                  data-glass
                  onClick={() => {
                    setSelectedZoneKey(null);
                    setSessionsOpen(false);
                    setTourIndex(0);
                  }}
                >
                  🎬 3D Tour
                </button>
              )}
              <button
                type="button"
                className="tour-btn glass-surface"
                data-glass
                onClick={() => setPhotoTourOpen(true)}
              >
                📷 Photo Tour
              </button>
            </div>

            {!touring && (
              <span className="stage-hint glass-surface" data-glass>
                🎮 WASD / arrows to walk · Enter to open a pool
              </span>
            )}

            {/* guided-tour card: title, story, stop dots, prev/next */}
            {touring && tourStop && (
              <div className="tour-card glass-surface" data-glass>
                <div className="tour-card-top">
                  <div>
                    <h4>{tourStop.title}</h4>
                    <p>{tourStop.text}</p>
                  </div>
                  <button className="tour-exit" onClick={() => setTourIndex(null)} aria-label="Exit tour">
                    ✕
                  </button>
                </div>
                <div className="tour-card-nav">
                  <button
                    className="tour-arrow"
                    disabled={tourIndex === 0}
                    onClick={() => setTourIndex((i) => Math.max(0, (i ?? 0) - 1))}
                    aria-label="Previous stop"
                  >
                    ‹
                  </button>
                  <div className="tour-dots" role="tablist">
                    {TOUR_STOPS.map((s, i) => (
                      <button
                        key={s.key}
                        className={`tour-dot ${i === tourIndex ? "active" : ""}`}
                        onClick={() => setTourIndex(i)}
                        aria-label={s.title}
                        title={s.title}
                      />
                    ))}
                  </div>
                  <button
                    className="tour-arrow"
                    disabled={tourIndex === TOUR_STOPS.length - 1}
                    onClick={() => setTourIndex((i) => Math.min(TOUR_STOPS.length - 1, (i ?? 0) + 1))}
                    aria-label="Next stop"
                  >
                    ›
                  </button>
                </div>
                <span className="tour-hint">Drag to look around · ← → to move · Esc to exit</span>
              </div>
            )}

            {!touring && (
              <button
                type="button"
                className="sessions-toggle glass-surface"
                data-glass
                onClick={() => setSessionsOpen((v) => !v)}
                aria-expanded={sessionsOpen}
              >
                🏊 Pool Sessions
                {dayEvents.length > 0 && <span className="sessions-toggle-count">{dayEvents.length}</span>}
                <span className={`sessions-toggle-chevron ${sessionsOpen ? "is-open" : ""}`}>▾</span>
              </button>
            )}

            {sessionsOpen && (
              <>
                <div className="sessions-overlay" onClick={() => setSessionsOpen(false)} />
                <ul className="zone-cards sessions-panel glass-surface" data-glass>
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
                              <button
                                className="zone-card-more"
                                onClick={() => {
                                  setSelectedZoneKey(zone.key);
                                  setSessionsOpen(false);
                                }}
                              >
                                +{overflow} more
                              </button>
                            ) : (
                              <button
                                className="zone-card-more zone-card-more-ghost"
                                onClick={() => {
                                  setSelectedZoneKey(zone.key);
                                  setSessionsOpen(false);
                                }}
                              >
                                View all
                              </button>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
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

      {/* ---- embedded Klapty 360° photo tour of the real facility ---- */}
      {photoTourOpen && (
        <div className="photo-tour-backdrop" onClick={() => setPhotoTourOpen(false)}>
          <div className="photo-tour-shell" onClick={(e) => e.stopPropagation()}>
            <header className="photo-tour-head">
              <h4>UBC Aquatic Centre · 360° Photo Tour</h4>
              <button
                className="tour-exit"
                onClick={() => setPhotoTourOpen(false)}
                aria-label="Close photo tour"
              >
                ✕
              </button>
            </header>
            <iframe
              className="photo-tour-frame"
              src={KLAPTY_TOUR_URL}
              title="UBC Aquatic Centre 360° virtual tour"
              allow="fullscreen; gyroscope; accelerometer"
              allowFullScreen
            />
            <span className="photo-tour-credit">
              360° photography hosted on{" "}
              <a href="https://www.klapty.com/tour/hrK0IMVEyT" target="_blank" rel="noopener noreferrer">
                Klapty
              </a>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
