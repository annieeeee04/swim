import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CHARACTERS, type Character } from "../data/characters";
import { fetchOccupiedLanes, finishSwim, startSwim } from "../api";
import type { SwimEvent, SwimRecord } from "../types";
import { formatDayHeading, formatTime } from "../utils/time";
import type { SwimmerPose3D } from "./Pool3D";
import SwimmerAvatar from "./SwimmerAvatar";
import SwimSchool from "./SwimSchool";

// Three.js is heavy, so the 3D pool scene is its own lazy-loaded chunk —
// it only downloads once someone actually opens the Pool tab.
const Pool3D = lazy(() => import("./Pool3D"));

type Stage =
  | "character"
  | "slot"
  | "length"
  | "lane"
  | "arriving"
  | "poolside"
  | "swimming"
  | "climbing"
  | "distance"
  | "summary";

interface Slot {
  start: string;
  end: string;
  lengths: (25 | 50)[];
}

const CLIMB_MS = 800;

/** Groups the schedule into unique time slots (start–end), noting which pool
 *  length(s) are actually offered at each one — some slots only run a 25m
 *  session, others run 25m and 50m side by side. */
function buildSlotsByDay(events: SwimEvent[]): [string, Slot[]][] {
  const slotMap = new Map<string, Slot>();
  for (const ev of events) {
    const key = `${ev.start}|${ev.end}`;
    const length: 25 | 50 = ev.title.toLowerCase().includes("50m") ? 50 : 25;
    const existing = slotMap.get(key);
    if (existing) {
      if (!existing.lengths.includes(length)) existing.lengths.push(length);
    } else {
      slotMap.set(key, { start: ev.start, end: ev.end, lengths: [length] });
    }
  }

  const dayMap = new Map<string, Slot[]>();
  for (const slot of slotMap.values()) {
    slot.lengths.sort((a, b) => a - b);
    const dayKey = slot.start.slice(0, 10);
    const existing = dayMap.get(dayKey);
    if (existing) {
      existing.push(slot);
    } else {
      dayMap.set(dayKey, [slot]);
    }
  }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, slots]) => [dayKey, [...slots].sort((a, b) => a.start.localeCompare(b.start))]);
}

export default function PoolView({ events }: { events: SwimEvent[] }) {
  const [stage, setStage] = useState<Stage>("character");
  const [character, setCharacter] = useState<Character | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [poolLength, setPoolLength] = useState<25 | 50 | null>(null);
  const [occupiedLanes, setOccupiedLanes] = useState<number[]>([]);
  const [record, setRecord] = useState<SwimRecord | null>(null);
  const [finishedRecord, setFinishedRecord] = useState<SwimRecord | null>(null);
  const [distanceInput, setDistanceInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotsByDay = useMemo(() => buildSlotsByDay(events), [events]);

  // Entering the lane-picking stage: find out which lanes are already taken.
  useEffect(() => {
    if (stage !== "lane") return;
    let cancelled = false;
    fetchOccupiedLanes()
      .then((lanes) => {
        if (!cancelled) setOccupiedLanes(lanes);
      })
      .catch(() => {
        if (!cancelled) setOccupiedLanes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // Once we've "arrived" at the pool deck (centered), walk over to the assigned lane.
  useEffect(() => {
    if (stage !== "arriving") return;
    const t = setTimeout(() => setStage("poolside"), 60);
    return () => clearTimeout(t);
  }, [stage]);

  // After climbing out, give the climb-out animation a moment before showing the form.
  useEffect(() => {
    if (stage !== "climbing") return;
    const t = setTimeout(() => setStage("distance"), CLIMB_MS);
    return () => clearTimeout(t);
  }, [stage]);

  function handlePickSlot(slot: Slot) {
    setSelectedSlot(slot);
    setError(null);
    setStage("length");
  }

  function handlePickLength(length: 25 | 50) {
    setPoolLength(length);
    setError(null);
    setStage("lane");
  }

  async function handlePickLane(lane: number) {
    if (!character || !poolLength) return;
    setBusy(true);
    setError(null);
    try {
      const rec = await startSwim(character.id, poolLength, lane);
      setRecord(rec);
      setStage("arriving");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the swim.");
      // Someone may have just taken it — refresh the occupied list.
      fetchOccupiedLanes().then(setOccupiedLanes).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    if (!record) return;
    const distance = Number(distanceInput);
    if (!Number.isFinite(distance) || distance < 0) {
      setError("Enter the distance you swam in meters (0 or more).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await finishSwim(record.id, distance);
      setFinishedRecord(updated);
      setStage("summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your distance.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("character");
    setCharacter(null);
    setSelectedSlot(null);
    setPoolLength(null);
    setOccupiedLanes([]);
    setRecord(null);
    setFinishedRecord(null);
    setDistanceInput("");
    setError(null);
  }

  const pose3d: SwimmerPose3D = stage === "swimming" ? "swim" : stage === "climbing" ? "climb" : "stand";
  // Each swim has a unique record id, so using it directly as the splash
  // trigger fires exactly one burst per swim without extra state.
  const splashTrigger = stage === "swimming" && record ? record.id : 0;

  return (
    <div className="pool-view">
      {stage === "character" && (
        <div className="picker-step">
          <h2>Pick your swimmer</h2>
          <div className="character-grid">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                className="character-card glass-surface"
                data-glass
                onClick={() => {
                  setCharacter(c);
                  setStage("slot");
                }}
              >
                <SwimmerAvatar character={c} pose="stand" size={48} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "slot" && character && (
        <div className="picker-step">
          <h2>
            <SwimmerAvatar character={character} pose="stand" size={32} />
            When are you swimming, {character.name}?
          </h2>
          {slotsByDay.length === 0 ? (
            <p className="empty-state">No upcoming Length Swim sessions found in the schedule.</p>
          ) : (
            <div className="slot-days">
              {slotsByDay.map(([dayKey, slots]) => (
                <section key={dayKey} className="slot-day-group">
                  <h3 className="slot-day-heading">{formatDayHeading(dayKey)}</h3>
                  <div className="slot-list">
                    {slots.map((slot) => (
                      <button
                        key={`${slot.start}|${slot.end}`}
                        className="slot-button glass-surface"
                        data-glass
                        onClick={() => handlePickSlot(slot)}
                      >
                        <span>
                          {formatTime(slot.start)}–{formatTime(slot.end)}
                        </span>
                        <span className="slot-lengths">
                          {slot.lengths.map((l) => `${l}m`).join(" / ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === "length" && character && selectedSlot && (
        <div className="picker-step">
          <h2>
            <SwimmerAvatar character={character} pose="stand" size={32} />
            {formatTime(selectedSlot.start)}–{formatTime(selectedSlot.end)} — pick your pool
          </h2>
          <div className="length-choices">
            {selectedSlot.lengths.includes(25) && (
              <button className="length-button" onClick={() => handlePickLength(25)}>
                25m pool
              </button>
            )}
            {selectedSlot.lengths.includes(50) && (
              <button className="length-button" onClick={() => handlePickLength(50)}>
                50m pool
              </button>
            )}
          </div>
        </div>
      )}

      {stage === "lane" && character && (
        <div className="picker-step">
          <h2>
            <SwimmerAvatar character={character} pose="stand" size={32} />
            Pick your lane, {character.name}!
          </h2>
          <p className="pool-meta">
            🎮 WASD/arrows to walk, Enter to pick — or drag to rotate, scroll/pinch to zoom, tap an open lane below.
          </p>
          <div className="pool-arena">
            <SwimSchool count={4} seed={11} className="pool-school" />
            <div className="pool-stage pool-stage-big">
              <Suspense fallback={<div className="pool3d-loading">Loading the pool…</div>}>
                <Pool3D
                  activeLane={null}
                  onPickLane={handlePickLane}
                  occupiedLanes={occupiedLanes}
                  roamer={{
                    modelUrl: character.modelUrl,
                    modelScale: character.modelScale,
                    modelRotationY: character.modelRotationY,
                  }}
                />
              </Suspense>
            </div>
          </div>
          {error && <p className="pool-error">{error}</p>}
        </div>
      )}

      {stage !== "character" &&
        stage !== "slot" &&
        stage !== "length" &&
        stage !== "lane" &&
        character &&
        record && (
          <div className="pool-stage-wrap">
            <p className="pool-meta">
              {character.name} · Lane {record.lane} · {record.poolLength}m pool
              {selectedSlot && (
                <>
                  {" "}
                  · {formatTime(selectedSlot.start)}–{formatTime(selectedSlot.end)}
                </>
              )}
            </p>
            <SwimSchool count={4} seed={29} className="pool-school" />
            <div className="pool-stage pool-stage-big">
              <Suspense fallback={<div className="pool3d-loading">Loading the pool…</div>}>
                <Pool3D
                  activeLane={record.lane}
                  swimmer={{
                    suit: character.suit,
                    skin: character.skin,
                    cap: character.cap,
                    lane: record.lane,
                    pose: pose3d,
                    modelUrl: character.modelUrl,
                    modelScale: character.modelScale,
                    modelRotationY: character.modelRotationY,
                  }}
                  splashTrigger={splashTrigger}
                />
              </Suspense>
            </div>

            {stage === "poolside" && (
              <button className="length-button" onClick={() => setStage("swimming")}>
                Start swim! 🏁
              </button>
            )}

            {stage === "swimming" && (
              <button className="length-button" onClick={() => setStage("climbing")}>
                Done swimming 🏁
              </button>
            )}

            {stage === "climbing" && <p className="pool-meta">Climbing out…</p>}

            {stage === "distance" && (
              <form
                className="distance-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleFinish();
                }}
              >
                <label htmlFor="distance">How far did you actually swim (meters)?</label>
                <div className="distance-row">
                  <input
                    id="distance"
                    type="number"
                    min="0"
                    step="25"
                    inputMode="decimal"
                    value={distanceInput}
                    onChange={(e) => setDistanceInput(e.target.value)}
                    placeholder="e.g. 800"
                    disabled={busy}
                    autoFocus
                  />
                  <button type="submit" className="length-button" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
                {error && <p className="pool-error">{error}</p>}
              </form>
            )}

            {stage === "summary" && finishedRecord && (
              <div className="summary-card glass-surface" data-glass>
                <p>
                  🎉 Nice swim, {character.name}! You swam{" "}
                  <strong>{finishedRecord.distanceMeters}m</strong> in Lane {finishedRecord.lane} (
                  {finishedRecord.poolLength}m pool).
                </p>
                <button className="length-button" onClick={reset}>
                  Swim again
                </button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
