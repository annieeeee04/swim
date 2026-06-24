import { useEffect, useMemo, useState } from "react";
import { CHARACTERS, type Character } from "../data/characters";
import { finishSwim, startSwim } from "../api";
import type { SwimEvent, SwimRecord } from "../types";
import { formatDayHeading, formatTime } from "../utils/time";
import PoolScene from "./PoolScene";
import SwimmerAvatar, { type SwimmerPose } from "./SwimmerAvatar";

type Stage =
  | "character"
  | "slot"
  | "length"
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

const DECK_Y = 32; // px, center of the deck strip
const LANE_ROW_HEIGHT = 36; // px, must match .lane height in PoolView.css
const DECK_HEIGHT = 64; // px, must match .pool-deck height in PoolView.css
const CLIMB_MS = 800;

function laneCenterXPercent(lane: number): number {
  return (lane - 0.5) * 10;
}

function laneWaterY(lane: number): number {
  return DECK_HEIGHT + (lane - 1) * LANE_ROW_HEIGHT + LANE_ROW_HEIGHT / 2;
}

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
  const [record, setRecord] = useState<SwimRecord | null>(null);
  const [finishedRecord, setFinishedRecord] = useState<SwimRecord | null>(null);
  const [distanceInput, setDistanceInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotsByDay = useMemo(() => buildSlotsByDay(events), [events]);

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

  async function handlePickLength(poolLength: 25 | 50) {
    if (!character) return;
    setBusy(true);
    setError(null);
    try {
      const rec = await startSwim(character.id, poolLength);
      setRecord(rec);
      setStage("arriving");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the swim.");
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
    setRecord(null);
    setFinishedRecord(null);
    setDistanceInput("");
    setError(null);
  }

  const showAvatar = record !== null;
  const xPercent = stage === "arriving" ? 50 : record ? laneCenterXPercent(record.lane) : 50;
  const yPx = stage === "swimming" ? (record ? laneWaterY(record.lane) : DECK_Y) : DECK_Y;
  const pose: SwimmerPose = stage === "swimming" ? "swim" : stage === "climbing" ? "climb" : "stand";
  const bobbing = stage === "swimming";

  return (
    <div className="pool-view">
      {stage === "character" && (
        <div className="picker-step">
          <h2>Pick your swimmer</h2>
          <div className="character-grid">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                className="character-card"
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
                        className="slot-button"
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
              <button className="length-button" disabled={busy} onClick={() => handlePickLength(25)}>
                25m pool
              </button>
            )}
            {selectedSlot.lengths.includes(50) && (
              <button className="length-button" disabled={busy} onClick={() => handlePickLength(50)}>
                50m pool
              </button>
            )}
          </div>
          {error && <p className="pool-error">{error}</p>}
        </div>
      )}

      {stage !== "character" && stage !== "slot" && stage !== "length" && character && record && (
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
          <div className="pool-stage">
            <PoolScene activeLane={record.lane} />
            {showAvatar && (
              <div
                className="avatar-wrapper"
                style={{ left: `${xPercent}%`, top: `${yPx}px` }}
              >
                <div className={`avatar-inner ${bobbing ? "avatar-bob" : ""}`}>
                  <SwimmerAvatar character={character} pose={pose} size={40} />
                </div>
              </div>
            )}
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
            <div className="summary-card">
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
