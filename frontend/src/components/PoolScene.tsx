const LANES = 10;

/** Static 10-lane pool with a deck strip on top. Purely visual scaffolding —
 *  the swimmer avatar is positioned on top of this by the parent (PoolView). */
export default function PoolScene({ activeLane }: { activeLane: number | null }) {
  return (
    <div className="pool-scene">
      <div className="pool-deck">
        {Array.from({ length: LANES }, (_, i) => i + 1).map((lane) => (
          <div key={lane} className="deck-cell" />
        ))}
      </div>
      <div className="pool-lanes">
        {Array.from({ length: LANES }, (_, i) => i + 1).map((lane) => (
          <div key={lane} className={`lane ${lane === activeLane ? "lane-active" : ""}`}>
            <span className="lane-number">{lane}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
