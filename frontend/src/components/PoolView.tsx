import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CHARACTERS, type Character } from "../data/characters";
import { fetchFriends, fetchOccupiedLanes, finishSwim, startSwim } from "../api";
import type { FriendSwimmer3D } from "./Pool3D";
import type { SwimEvent, SwimRecord, User } from "../types";
import { buildSlotsByDay, type Slot } from "../utils/slots";
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

const CLIMB_MS = 800;

const PREVIEW_POSES = ["stand", "swim", "climb"] as const;
const POSE_LABEL: Record<(typeof PREVIEW_POSES)[number], string> = {
  stand: "Stand",
  swim: "Swim",
  climb: "Climb",
};

export default function PoolView({ events, user }: { events: SwimEvent[]; user?: User | null }) {
  const [stage, setStage] = useState<Stage>("character");
  const [character, setCharacter] = useState<Character | null>(null);
  const [previewPose, setPreviewPose] = useState<(typeof PREVIEW_POSES)[number]>("stand");
  const [previewSize, setPreviewSize] = useState(56);
  const [motionOn, setMotionOn] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [poolLength, setPoolLength] = useState<25 | 50 | null>(null);
  const [occupiedLanes, setOccupiedLanes] = useState<number[]>([]);
  const [record, setRecord] = useState<SwimRecord | null>(null);
  const [finishedRecord, setFinishedRecord] = useState<SwimRecord | null>(null);
  const [distanceInput, setDistanceInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friendSwimmers, setFriendSwimmers] = useState<FriendSwimmer3D[]>([]);

  const slotsByDay = useMemo(() => buildSlotsByDay(events), [events]);

  // The logged-in user's own avatar becomes the first, pre-eminent swimmer in
  // the roster — this is the avatar that actually enters the pool for them.
  const youCharacter = useMemo<Character | null>(
    () =>
      user
        ? {
            id: `me-${user.id}`,
            name: "You",
            skin: user.avatarSkin ?? "#f3c89e",
            suit: user.avatarSuit ?? "#ec4899",
            cap: user.avatarCap ?? "#a855f7",
            modelUrl: "",
          }
        : null,
    [user],
  );
  const roster = useMemo(
    () => (youCharacter ? [youCharacter, ...CHARACTERS] : CHARACTERS),
    [youCharacter],
  );

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

  // While the 3D pool is on screen, poll for friends who are swimming right
  // now so they appear live in their lanes (and you can go find them IRL).
  const poolVisible =
    stage === "lane" || stage === "arriving" || stage === "poolside" ||
    stage === "swimming" || stage === "climbing";
  useEffect(() => {
    if (!poolVisible || !user) return;
    let cancelled = false;
    const load = () => {
      fetchFriends()
        .then((friends) => {
          if (cancelled) return;
          setFriendSwimmers(
            friends
              .filter((f) => f.inPool && f.lane != null)
              .map((f) => ({
                name: f.user.displayName,
                lane: f.lane as number,
                suit: f.user.avatarSuit,
                skin: f.user.avatarSkin,
                cap: f.user.avatarCap,
              })),
          );
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [poolVisible, user]);

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
        <div className="picker-step picker-step-roster">
          <h2>Pick your swimmer</h2>

          {/* Premium glass "Swimmer Controller" — floating dock above the roster */}
          <div className="studio-card glass-surface" data-glass>
            <span className="studio-card-title">Swimmer Controller</span>

            <div className="studio-card-body">
              <div className="studio-row">
                <span className="studio-label">Pose</span>
                <div className="pose-seg">
                  {PREVIEW_POSES.map((p) => {
                    const active = previewPose === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`pose-seg-btn ${active ? "active" : ""}`}
                        onClick={() => setPreviewPose(p)}
                      >
                        {active && (
                          <motion.span
                            layoutId="poseIndicator"
                            className="pose-seg-indicator"
                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                          />
                        )}
                        <span className="pose-seg-label">{POSE_LABEL[p]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="studio-row studio-row-split">
                <div className="studio-field">
                  <span className="studio-label">
                    Size <em>{previewSize}px</em>
                  </span>
                  <input
                    type="range"
                    min={32}
                    max={88}
                    value={previewSize}
                    onChange={(e) => setPreviewSize(Number(e.target.value))}
                    className="size-slider"
                    aria-label="Preview size"
                  />
                </div>

                <button
                  type="button"
                  className={`motion-switch ${motionOn ? "on" : ""}`}
                  onClick={() => setMotionOn((v) => !v)}
                  aria-pressed={motionOn}
                >
                  <span className="motion-switch-label">Animate</span>
                  <span className="motion-switch-track">
                    <span className="motion-switch-knob" />
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="character-grid">
            {roster.map((c) => {
              const isYou = youCharacter?.id === c.id;
              const is2D = !c.modelUrl;
              const selected = character?.id === c.id;
              const badgeClass = isYou
                ? "character-badge-you"
                : is2D
                  ? "character-badge-2d"
                  : "character-badge-3d";
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`character-card glass-surface ${isYou ? "is-you" : ""} ${
                    is2D ? "is-2d" : ""
                  } ${selected ? "is-selected" : ""}`}
                  data-glass
                  aria-pressed={selected}
                  onClick={() => setCharacter(c)}
                  onDoubleClick={() => {
                    setCharacter(c);
                    setStage("slot");
                  }}
                >
                  <span className={`character-badge ${badgeClass}`}>
                    {isYou ? "you" : is2D ? "2D only" : "3D"}
                  </span>
                  <span className="avatar-stage">
                    <span className={`avatar-wrap ${motionOn ? "avatar-motion" : ""}`}>
                      <SwimmerAvatar character={c} pose={previewPose} size={previewSize} />
                    </span>
                  </span>
                  <span className="character-name">{isYou ? user?.displayName ?? "You" : c.name}</span>
                  {is2D && !isYou && (
                    <span className="character-hint" title="No 3D model yet — appears as a 2D swimmer in the pool">
                      no 3D model yet
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {character && (
              <motion.div
                className="roster-confirm glass-surface"
                data-glass
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                <span className="roster-confirm-who">
                  <SwimmerAvatar character={character} pose="stand" size={30} />
                  <span>
                    Swim as <strong>{character.name}</strong>
                  </span>
                </span>
                <button type="button" className="length-button" onClick={() => setStage("slot")}>
                  Choose lane →
                </button>
              </motion.div>
            )}
          </AnimatePresence>
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
          {friendSwimmers.length > 0 && (
            <p className="pool-meta pool-friends-note">
              🌊 In the pool now:{" "}
              {friendSwimmers.map((f) => `${f.name} (Lane ${f.lane})`).join(" · ")}
            </p>
          )}
          <div className="pool-arena">
            <SwimSchool count={4} seed={11} className="pool-school" />
            <div className="pool-stage pool-stage-big">
              <Suspense fallback={<div className="pool3d-loading">Loading the pool…</div>}>
                <Pool3D
                  activeLane={null}
                  onPickLane={handlePickLane}
                  occupiedLanes={occupiedLanes}
                  friends={friendSwimmers}
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
                  friends={friendSwimmers}
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
