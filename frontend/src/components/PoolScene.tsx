const LANES = 10;

interface PoolSceneProps {
  activeLane: number | null;
  /** If set, lanes become clickable buttons (lane-picking mode). */
  onPickLane?: (lane: number) => void;
  occupiedLanes?: number[];
}

/** 10-lane pool with a deck strip on top. In read-only mode it's just visual
 *  scaffolding the swimmer avatar sits on top of; in interactive mode (when
 *  `onPickLane` is given) each free lane becomes clickable so the user can
 *  choose where to swim. */
export default function PoolScene({ activeLane, onPickLane, occupiedLanes = [] }: PoolSceneProps) {
  const interactive = onPickLane !== undefined;

  return (
    <div className="pool-scene">
      <div className="pool-deck">
        {Array.from({ length: LANES }, (_, i) => i + 1).map((lane) => (
          <div key={lane} className="deck-cell" />
        ))}
      </div>
      <div className="pool-lanes">
        {Array.from({ length: LANES }, (_, i) => i + 1).map((lane) => {
          const occupied = occupiedLanes.includes(lane);
          const classes = [
            "lane",
            lane === activeLane ? "lane-active" : "",
            interactive ? "lane-pickable" : "",
            interactive && occupied ? "lane-occupied" : "",
          ]
            .filter(Boolean)
            .join(" ");

          if (interactive) {
            return (
              <button
                key={lane}
                type="button"
                className={classes}
                disabled={occupied}
                onClick={() => onPickLane?.(lane)}
              >
                <span className="lane-number">{lane}</span>
                {occupied && <span className="lane-occupied-label">taken</span>}
              </button>
            );
          }

          return (
            <div key={lane} className={classes}>
              <span className="lane-number">{lane}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
