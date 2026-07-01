import { useMemo } from "react";
import type { Character } from "../data/characters";
import SwimmerAvatar from "./SwimmerAvatar";

/**
 * Decorative "school of swimmers" layer — a purely 2D, game-y background of
 * chibi swimmers (SwimmerAvatar in its "swim" pose) drifting across the
 * screen at different sizes, depths and vertical lanes, each bobbing and
 * gently pulsing in size as it goes.
 *
 * These are NOT the pickable roster (Woody/Buzz/Bo Peep keep their real 3D
 * models) — they're the "extras" that fill the pool with life behind the UI,
 * recolored from a small palette so no two neighbours match. Everything is
 * CSS-animated and pointer-events:none, so it's cheap and never blocks input.
 */

// 2D-only palettes — no modelUrl needed, the swim pose is pure SVG.
const PALETTES: Pick<Character, "skin" | "suit" | "cap">[] = [
  { skin: "#f3c89e", suit: "#ec4899", cap: "#be185d" },
  { skin: "#e7b48a", suit: "#38bdf8", cap: "#0369a1" },
  { skin: "#edd1b3", suit: "#a855f7", cap: "#6d28d9" },
  { skin: "#f1c9a5", suit: "#14b8a6", cap: "#0f766e" },
  { skin: "#e9b894", suit: "#fbbf24", cap: "#b45309" },
  { skin: "#f4cda3", suit: "#f43f5e", cap: "#9f1239" },
  { skin: "#ecc39c", suit: "#22c55e", cap: "#15803d" },
];

interface DriftingSwimmer {
  id: number;
  palette: Pick<Character, "skin" | "suit" | "cap">;
  top: number; // vertical lane, %
  size: number; // avatar size, px
  duration: number; // seconds to cross
  delay: number; // negative => starts mid-screen
  reverse: boolean; // right-to-left instead of left-to-right
  bob: number; // bob amplitude, px
  opacity: number;
}

/** Tiny seeded PRNG so the layout is stable across re-renders but varied. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSwimmers(count: number, seed: number): DriftingSwimmer[] {
  const rand = mulberry32(seed);
  const out: DriftingSwimmer[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    out.push({
      id: i,
      palette: PALETTES[Math.floor(rand() * PALETTES.length)],
      top: 6 + rand() * 84,
      size: 26 + Math.round(rand() * 42), // 26–68px -> visible size variety
      duration: 16 + rand() * 18, // 16–34s
      delay: -rand() * 30, // stagger + pre-fill the screen
      reverse: r > 0.5,
      bob: 8 + rand() * 16,
      opacity: 0.45 + rand() * 0.4,
    });
  }
  return out;
}

interface SwimSchoolProps {
  count?: number;
  /** Stable seed so multiple instances differ but stay consistent per mount. */
  seed?: number;
  /** position: fixed (full-viewport bg) vs absolute (inside a relative box). */
  fixed?: boolean;
  className?: string;
}

export default function SwimSchool({ count = 7, seed = 7, fixed = false, className }: SwimSchoolProps) {
  const swimmers = useMemo(() => makeSwimmers(count, seed), [count, seed]);

  return (
    <div
      className={`swim-school ${fixed ? "swim-school-fixed" : ""} ${className ?? ""}`}
      aria-hidden="true"
    >
      {swimmers.map((s) => (
        <div
          key={s.id}
          className={`swim-lane ${s.reverse ? "swim-lane-rev" : ""}`}
          style={
            {
              top: `${s.top}%`,
              opacity: s.opacity,
              "--dur": `${s.duration}s`,
              "--delay": `${s.delay}s`,
              "--bob": `${s.bob}px`,
            } as React.CSSProperties
          }
        >
          <span className="swim-face">
            <span className="swim-bob">
              <span className="swim-pulse">
                <SwimmerAvatar
                  character={{ ...s.palette, id: `extra-${s.id}`, name: "", modelUrl: "" }}
                  pose="swim"
                  size={s.size}
                />
              </span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
