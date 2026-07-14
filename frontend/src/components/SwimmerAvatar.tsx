import type { Character } from "../data/characters";
import type { BodyShape, HairStyle, SuitStyle } from "../utils/generateAvatar";

export type { BodyShape, HairStyle, SuitStyle };
export type SwimmerPose = "stand" | "swim" | "climb";

interface SwimmerAvatarProps {
  character: Character;
  pose: SwimmerPose;
  size?: number;
  className?: string;
  /** Body silhouette. Defaults to "athletic". */
  bodyShape?: BodyShape;
  /** Hair style. Defaults to "short". */
  hairStyle?: HairStyle;
  /** Hair hex color. Defaults to a tone derived from skin. */
  hairColor?: string;
  /** Swimsuit cut. Defaults to "classic". */
  suitStyle?: SuitStyle;
}

const GOGGLE = "#2e2a40";
const GLASS = "#bfe9f7";

/* ---------- tiny color helpers so every character self-shades ---------- */

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Mixes `hex` toward `target` by weight w (0..1). */
function mix(hex: string, target: string, w: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const t = /^#?([0-9a-f]{6})$/i.exec(target.trim());
  if (!m || !t) return hex;
  const a = parseInt(m[1], 16);
  const b = parseInt(t[1], 16);
  const r = clamp(((a >> 16) & 255) * (1 - w) + ((b >> 16) & 255) * w);
  const g = clamp(((a >> 8) & 255) * (1 - w) + ((b >> 8) & 255) * w);
  const bl = clamp((a & 255) * (1 - w) + (b & 255) * w);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

const shade = (hex: string, f: number) => mix(hex, "#1a1026", f);
const tint = (hex: string, f: number) => mix(hex, "#ffffff", f);
/** Natural hair tone derived from the chosen skin. */
const hairOf = (skin: string) => mix(skin, "#2f2013", 0.74);

/* ─────────────────────────────────────────────────────────────────────────
   STAND POSE HELPERS
   Each returns a JSX.Element (or Fragment). All coordinates are in the
   72 × 96 viewBox.
───────────────────────────────────────────────────────────────────────── */

/** Legs + feet for each body shape. */
function StandLegs({ shape, skin, skinShade }: { shape: BodyShape; skin: string; skinShade: string }) {
  if (shape === "lean") return (
    <>
      <path d="M29.5 60 h5.5 l-.9 23 q0 2.4 -2.3 2.4 q-2.3 0 -2.4 -2.4 z" fill={skin} />
      <path d="M37 60 h5.5 l-.6 23 q0 2.4 -2.2 2.4 q-2.3 0 -2.3 -2.4 z" fill={skin} />
      <path d="M33.5 62 l-.5 21 q1.4 .3 1.4 -.9 l.5 -20 z" fill={skinShade} opacity="0.5" />
      <path d="M41.1 62 l-.4 21 q1.3 .3 1.4 -.9 l.4 -20 z" fill={skinShade} opacity="0.5" />
      <ellipse cx="31.8" cy="86" rx="4.2" ry="2.5" fill={skin} />
      <ellipse cx="40.3" cy="86" rx="4.2" ry="2.5" fill={skin} />
    </>
  );
  if (shape === "strong") return (
    <>
      <path d="M26 60 h8.5 l-1.2 21 q0 3 -3 3 q-3 0 -3.2 -3 z" fill={skin} />
      <path d="M37.5 60 h8.5 l-1 21 q0 3 -3 3 q-3 0 -3 -3 z" fill={skin} />
      <path d="M33 62 l-.7 19 q1.7 .5 1.8 -.9 l.7 -18 z" fill={skinShade} opacity="0.5" />
      <path d="M44 62 l-.6 19 q1.7 .5 1.7 -.9 l.6 -18 z" fill={skinShade} opacity="0.5" />
      <ellipse cx="29.5" cy="85.5" rx="5.8" ry="3.1" fill={skin} />
      <ellipse cx="42.5" cy="85.5" rx="5.8" ry="3.1" fill={skin} />
    </>
  );
  // athletic (default — original paths)
  return (
    <>
      <path d="M28.2 60 h7 l-1 22 q0 2.6 -2.6 2.6 q-2.6 0 -2.7 -2.6 z" fill={skin} />
      <path d="M36.8 60 h7 l-.7 22 q-.1 2.6 -2.7 2.6 q-2.6 0 -2.6 -2.6 z" fill={skin} />
      <path d="M33.4 62 l-.6 20 q1.6 .4 1.6 -1 l.6 -19 z" fill={skinShade} opacity="0.5" />
      <path d="M42 62 l-.5 20 q1.5 .4 1.6 -1 l.5 -19 z" fill={skinShade} opacity="0.5" />
      <ellipse cx="30.6" cy="85.5" rx="5" ry="2.9" fill={skin} />
      <ellipse cx="41.4" cy="85.5" rx="5" ry="2.9" fill={skin} />
    </>
  );
}

/**
 * Arms. For rash guard the forearms are drawn in suit color; hands always skin.
 * `suit` is only consulted when suitStyle === "rash".
 */
function StandArms({
  shape, skin, suitStyle, suit,
}: {
  shape: BodyShape; skin: string; suitStyle: SuitStyle; suit: string;
}) {
  const armFill = suitStyle === "rash" ? suit : skin;

  if (shape === "lean") return (
    <>
      <path d="M22 42 q-4 3 -4.8 9.5 q-.6 5.5 1.4 9 q1.6 2.3 3.4 .6 q1.4 -1.5 .8 -3.8 q-1.2 -5.2 .7 -12 z" fill={armFill} />
      <path d="M50 42 q4 3 4.8 9.5 q.6 5.5 -1.4 9 q-1.6 2.3 -3.4 .6 q-1.4 -1.5 -.8 -3.8 q1.2 -5.2 -.7 -12 z" fill={armFill} />
      <circle cx="20.5" cy="63" r="2.7" fill={skin} />
      <circle cx="51.5" cy="63" r="2.7" fill={skin} />
    </>
  );
  if (shape === "strong") return (
    <>
      <path d="M18 42 q-5 3.5 -6.2 11 q-1 7 2 12 q2.4 3 5 1 q2 -2.2 1.2 -5 q-1.8 -7 .8 -15 z" fill={armFill} />
      <path d="M54 42 q5 3.5 6.2 11 q1 7 -2 12 q-2.4 3 -5 1 q-2 -2.2 -1.2 -5 q1.8 -7 -.8 -15 z" fill={armFill} />
      <circle cx="16" cy="67" r="3.6" fill={skin} />
      <circle cx="56" cy="67" r="3.6" fill={skin} />
    </>
  );
  // athletic (original)
  return (
    <>
      <path d="M20 42 q-4.5 3 -5.5 10 q-.8 6 1.6 10.5 q1.8 2.6 3.8 .8 q1.6 -1.8 .9 -4.5 q-1.4 -6 .8 -13 z" fill={armFill} />
      <path d="M52 42 q4.5 3 5.5 10 q.8 6 -1.6 10.5 q-1.8 2.6 -3.8 .8 q-1.6 -1.8 -.9 -4.5 q1.4 -6 -.8 -13 z" fill={armFill} />
      <circle cx="18" cy="64.5" r="3.1" fill={skin} />
      <circle cx="54" cy="64.5" r="3.1" fill={skin} />
    </>
  );
}

/**
 * Swimsuit torso overlay — sits on top of the body fill.
 * Combines body shape (determines width) with suit style (determines cut).
 */
function StandSuit({
  shape, style, suit, suitShade,
}: {
  shape: BodyShape; style: SuitStyle; suit: string; suitShade: string;
}) {
  // ── torso paths per body shape ──────────────────────────────────────────
  const torso = {
    lean:    "M27 41 q9 -3 18 0 q3.8 1.4 3.8 7 q0 4.5 -1.4 8.5 q-1.5 9.5 -12 9.5 q-10.5 0 -12 -9.5 q-1.4 -4 -1.4 -8.5 q0 -5.6 3.8 -7 z",
    athletic:"M25 41 q11 -3.5 22 0 q4.5 1.6 4.5 7.5 q0 5 -1.6 9 q-1.8 10.5 -13.9 10.5 q-12.1 0 -13.9 -10.5 q-1.6 -4 -1.6 -9 q0 -5.9 4.5 -7.5 z",
    strong:  "M22 41 q14 -4 28 0 q5.2 1.8 5.2 8.5 q0 5.5 -1.8 9.5 q-2 11.5 -16 11.5 q-14 0 -16 -11.5 q-1.8 -4 -1.8 -9.5 q0 -6.7 5.2 -8.5 z",
  }[shape];

  const torsoShade = {
    lean:    "M25 57 q3 7.5 11 7.5 q8 0 11 -7.5 q-.8 8 -11 8 q-10.2 0 -11 -8 z",
    athletic:"M23.5 58 q3.5 8 12.5 8 q9 0 12.5 -8 q-1 9.5 -12.5 9.5 q-11.5 0 -12.5 -9.5 z",
    strong:  "M21 59 q4 9 15 9 q11 0 15 -9 q-1.2 10.5 -15 10.5 q-13.8 0 -15 -10.5 z",
  }[shape];

  // highlight ellipse (left-of-center chest sheen)
  const hl = {
    lean:    { cx: 30,   cy: 47.5, rx: 3,   ry: 6   },
    athletic:{ cx: 29,   cy: 47.5, rx: 3.4, ry: 6.5 },
    strong:  { cx: 28,   cy: 48.5, rx: 4,   ry: 7   },
  }[shape];

  // thin-strap (classic) positions
  const cs = {
    lean:    { lx: 27.5, rx: 40.5, w: 4,   h: 10,   r: 2   },
    athletic:{ lx: 26,   rx: 41.6, w: 4.4, h: 11,   r: 2.2 },
    strong:  { lx: 23.5, rx: 43.5, w: 5,   h: 12,   r: 2.5 },
  }[shape];

  // wide-strap (racer) positions
  const rs = {
    lean:    { lx: 26,   rx: 40,   w: 7, h: 9.5, r: 3 },
    athletic:{ lx: 24,   rx: 41,   w: 7, h: 10.5, r: 3 },
    strong:  { lx: 21,   rx: 43,   w: 8.5, h: 12, r: 3.5 },
  }[shape];

  // crop-top band positions (shorts style, at chest level)
  const ct = {
    lean:    { lx: 27,  w: 18, y: 37, h: 9  },
    athletic:{ lx: 24,  w: 24, y: 37, h: 9  },
    strong:  { lx: 21,  w: 30, y: 37, h: 10 },
  }[shape];

  // board shorts positions
  const bs = {
    lean:    { d: "M26.5 57 q9.5 -1.8 19 0 l-.8 16 q-9 2.2 -18 0 z" },
    athletic:{ d: "M24.5 57 q11.5 -2 23 0 l-1 17 q-10.5 2.5 -21 0 z" },
    strong:  { d: "M21 57 q15 -2.5 30 0 l-1.2 18 q-14 3 -28 0 z" },
  }[shape];

  // ── render per suit style ────────────────────────────────────────────────
  if (style === "racer") {
    return (
      <>
        <path d={torso} fill={suit} />
        {/* wide shoulder panels */}
        <rect x={rs.lx} y="33.5" width={rs.w} height={rs.h} rx={rs.r} fill={suit} />
        <rect x={rs.rx} y="33.5" width={rs.w} height={rs.h} rx={rs.r} fill={suit} />
        {/* shade + top-shade on straps */}
        <rect x={rs.lx} y="33.5" width={rs.w} height="3" rx={rs.r} fill={suitShade} opacity="0.4" />
        <rect x={rs.rx} y="33.5" width={rs.w} height="3" rx={rs.r} fill={suitShade} opacity="0.4" />
        <path d={torsoShade} fill={suitShade} opacity="0.6" />
        <ellipse cx={hl.cx} cy={hl.cy} rx={hl.rx} ry={hl.ry} fill={tint(suit, 0.28)} opacity="0.55" />
      </>
    );
  }

  if (style === "shorts") {
    return (
      <>
        {/* crop-top band */}
        <rect x={ct.lx} y={ct.y} width={ct.w} height={ct.h} rx="4.5" fill={suit} />
        <rect x={ct.lx} y={ct.y} width={ct.w} height="3.5" rx="4.5" fill={suitShade} opacity="0.35" />
        {/* midriff gap — skin shows through (no element needed, just the gap) */}
        {/* board shorts */}
        <path d={bs.d} fill={suit} />
        {/* waistband accent */}
        <path
          d={shape === "lean"
            ? "M26.5 57 q9.5 -1.8 19 0 q0 2.5 -9.5 2.5 q-9.5 0 -9.5 -2.5 z"
            : shape === "strong"
            ? "M21 57 q15 -2.5 30 0 q0 3 -15 3 q-15 0 -15 -3 z"
            : "M24.5 57 q11.5 -2 23 0 q0 3 -11.5 3 q-11.5 0 -11.5 -3 z"}
          fill={suitShade}
          opacity="0.5"
        />
        {/* shorts center seam */}
        <line
          x1="36" y1="59.5" x2="36" y2={shape === "strong" ? "75" : "73"}
          stroke={suitShade} strokeWidth="1" opacity="0.35"
          strokeLinecap="round"
        />
        {/* subtle chest highlight */}
        <ellipse cx={hl.cx} cy={ct.y + ct.h / 2} rx={hl.rx * 0.75} ry={ct.h * 0.3} fill={tint(suit, 0.3)} opacity="0.5" />
      </>
    );
  }

  if (style === "rash") {
    return (
      <>
        <path d={torso} fill={suit} />
        {/* high neckline collar */}
        <path
          d={shape === "lean"
            ? "M30 39 q6 -3 12 0 L42 43 L30 43 z"
            : shape === "strong"
            ? "M28 39 q8 -3.5 16 0 L44 43 L28 43 z"
            : "M29 39 q7 -3 14 0 L43 43 L29 43 z"}
          fill={suit}
        />
        {/* subtle zip seam */}
        <line x1="36" y1="39" x2="36" y2="45" stroke={suitShade} strokeWidth="1" opacity="0.3" strokeLinecap="round" />
        <path d={torsoShade} fill={suitShade} opacity="0.6" />
        <ellipse cx={hl.cx} cy={hl.cy} rx={hl.rx} ry={hl.ry} fill={tint(suit, 0.28)} opacity="0.55" />
      </>
    );
  }

  // ── classic (default) ────────────────────────────────────────────────────
  return (
    <>
      <path d={torso} fill={suit} />
      <path d={torsoShade} fill={suitShade} opacity="0.6" />
      <ellipse cx={hl.cx} cy={hl.cy} rx={hl.rx} ry={hl.ry} fill={tint(suit, 0.28)} opacity="0.55" />
      {/* thin shoulder straps */}
      <rect x={cs.lx} y="33.5" width={cs.w} height={cs.h} rx={cs.r} fill={suit} />
      <rect x={cs.rx} y="33.5" width={cs.w} height={cs.h} rx={cs.r} fill={suit} />
      <rect x={cs.lx} y="33.5" width={cs.w} height="3" rx={cs.r} fill={suitShade} opacity="0.5" />
      <rect x={cs.rx} y="33.5" width={cs.w} height="3" rx={cs.r} fill={suitShade} opacity="0.5" />
    </>
  );
}

/**
 * Hair elements that render BEHIND the body (long back panels, ponytail).
 * Call before drawing legs/arms so it layers correctly.
 */
function HairBack({ style, color }: { style: HairStyle; color: string }) {
  if (style === "long") return (
    <>
      <path d="M22 37 q-6 11 -4 24 q1.5 4.5 4.5 2.5 q-1.5 -8.5 .5 -20 z" fill={color} />
      <path d="M50 37 q6 11 4 24 q-1.5 4.5 -4.5 2.5 q1.5 -8.5 -.5 -20 z" fill={color} />
    </>
  );
  if (style === "ponytail") return (
    // ponytail sweeping to the left-back
    <path d="M21.5 23 q-7 7 -7 18 q0 11 3.5 14.5 q3 2.5 4.5 .5 q-3 -7 -2 -15 q1 -10 4.5 -15 z" fill={color} />
  );
  return null;
}

/**
 * Hair elements that render in FRONT of the body but behind the face:
 * the side tufts visible beside the head.
 */
function HairSide({ style, color }: { style: HairStyle; color: string }) {
  if (style === "buzz") return (
    <>
      <path d="M23 20.5 q-1.5 3 .2 5.5 q1.5 -.5 1.2 -3 q-.2 -1.5 -1.4 -2.5 z" fill={color} />
      <path d="M49 20.5 q1.5 3 -.2 5.5 q-1.5 -.5 -1.2 -3 q.2 -1.5 1.4 -2.5 z" fill={color} />
    </>
  );
  if (style === "short") return (
    <>
      <path d="M22.4 20 q-2.4 7 .8 12 q3 -1.4 2.4 -6 q-.5 -3.6 -3.2 -6 z" fill={color} />
      <path d="M49.6 20 q2.4 7 -.8 12 q-3 -1.4 -2.4 -6 q.5 -3.6 3.2 -6 z" fill={color} />
    </>
  );
  if (style === "wavy") return (
    <>
      <path d="M21.2 20 q-3.5 8 -.5 15 q2 3 4.5 1.5 q-3 -4.5 -1.5 -10.5 q.5 -4 -2.5 -6 z" fill={color} />
      <path d="M50.8 20 q3.5 8 .5 15 q-2 3 -4.5 1.5 q3 -4.5 1.5 -10.5 q-.5 -4 2.5 -6 z" fill={color} />
    </>
  );
  if (style === "long") return (
    <>
      <path d="M21 20 q-4 9 -2.5 22 q1 5 4 3.5 q-2 -8 .5 -19 q.5 -5 -2 -6.5 z" fill={color} />
      <path d="M51 20 q4 9 2.5 22 q-1 5 -4 3.5 q2 -8 -.5 -19 q-.5 -5 2 -6.5 z" fill={color} />
    </>
  );
  // bun or ponytail — small tufts
  return (
    <>
      <path d="M22.5 20 q-2 5 .4 8.5 q2.4 -1 1.9 -4.2 q-.3 -2.4 -2.3 -4.3 z" fill={color} />
      <path d="M49.5 20 q2 5 -.4 8.5 q-2.4 -1 -1.9 -4.2 q.3 -2.4 2.3 -4.3 z" fill={color} />
    </>
  );
}

/**
 * Fringe that peeks out under the front edge of the cap.
 * Not shown for buzz cut. Bun/ponytail get a softer fringe.
 */
function HairFringe({ style, color }: { style: HairStyle; color: string }) {
  if (style === "buzz") return null;
  if (style === "wavy") return (
    // wavy fringe with slight zig-zag
    <path
      d="M24.5 19 q2.5 4.5 5 1.5 q2 4.5 5 1 q2.5 3.5 5 .5 q3 3 5 -1.5 q-4.5 -5 -10 -5 q-7 .5 -10 3.5 z"
      fill={color}
    />
  );
  if (style === "bun" || style === "ponytail") return (
    // smaller fringe (hair pulled back, less at front)
    <path
      d="M26 19 q2.5 3 5 .5 q2.5 2.8 5 .5 q2.5 2.5 5 0 q-4.2 -4 -10 -4.2 q-6.5 .3 -10 3.2 z"
      fill={color}
    />
  );
  // short and long: standard fringe
  return (
    <path
      d="M25 18.6 q3 3.4 6 .8 q2.6 3 5 .4 q2.4 2.6 5 .2 q3 2.4 5.6 -1 q-4 -4.6 -10.8 -4.8 q-7 -.2 -10.8 4.4 z"
      fill={color}
    />
  );
}

/**
 * Elements rendered ON TOP of the cap: bun (top-knot), ponytail scrunchie.
 */
function HairTopper({ style, color }: { style: HairStyle; color: string }) {
  if (style === "bun") return (
    <>
      <circle cx="36" cy="6.5" r="5.5" fill={color} />
      <ellipse cx="36" cy="9.8" rx="3.5" ry="1.8" fill={shade(color, 0.22)} />
      <ellipse cx="36" cy="11.2" rx="2" ry=".9" fill={shade(color, 0.32)} />
    </>
  );
  if (style === "ponytail") return (
    // small hair-tie / scrunchie where the ponytail gathers
    <ellipse cx="22" cy="22.5" rx="2.5" ry="1.4" fill={shade(color, 0.3)} />
  );
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────── */

/**
 * The brand's swimmer avatar — fully recolorable SVG with modular body
 * shape, hair style, and swimsuit style options.
 *
 * Props `bodyShape`, `hairStyle`, `hairColor`, and `suitStyle` are all
 * optional so every existing call site continues to work unchanged with
 * the original athletic/short-hair/classic look.
 */
export default function SwimmerAvatar({
  character,
  pose,
  size = 56,
  className,
  bodyShape,
  hairStyle,
  hairColor,
  suitStyle,
}: SwimmerAvatarProps) {
  const { skin, suit, cap } = character;

  const bs: BodyShape = bodyShape ?? "athletic";
  const hs: HairStyle = hairStyle ?? "short";
  const hColor = hairColor ?? hairOf(skin);
  const ss: SuitStyle = suitStyle ?? "classic";

  const hair = hColor; // alias for brows (use chosen hair color)
  const skinShade = shade(skin, 0.16);
  const skinLine = shade(skin, 0.34);
  const suitShade = shade(suit, 0.22);
  const capShade = shade(cap, 0.24);
  const mouth = shade(skin, 0.5);

  /* ── swim pose (unchanged) ─────────────────────────────────────────── */
  if (pose === "swim") {
    const width = Math.round(size * 1.55);
    const height = Math.round((width * 56) / 96);
    return (
      <svg className={className} width={width} height={height} viewBox="0 0 96 56" xmlns="http://www.w3.org/2000/svg">
        <path d="M34 30 L16 25.5 q-3 .8 -2.6 3 q.3 1.8 3 2 L34 33.5 z" fill={skinShade} />
        <path d="M34 31 L14 33.5 q-2.8 1 -2.2 3.2 q.5 1.9 3.2 1.6 L34 35 z" fill={skin} />
        <path d="M64 22 q-8 -12 -20 -10 q-2.6 .5 -2.2 2.8 q.4 2 2.8 2 q9 -1.2 15 7 z" fill={skin} />
        <circle cx="43" cy="13.5" r="3" fill={skin} />
        <ellipse cx="50" cy="31" rx="20" ry="9.6" fill={suit} />
        <path d="M31 32.5 a19.5 9 0 0 0 38 0 l0 2 a19.5 8 0 0 1 -38 0 z" fill={suitShade} opacity="0.55" />
        <ellipse cx="44" cy="27" rx="8" ry="3" fill={tint(suit, 0.25)} opacity="0.6" />
        <path d="M66 28 L90 26.5 q2.8 .3 2.8 2.6 q0 2.3 -2.8 2.4 L66 32 z" fill={skinShade} />
        <circle cx="90.5" cy="29" r="3" fill={skinShade} />
        <circle cx="73" cy="22" r="12" fill={skin} />
        <path d="M62.5 24 q-1.5 4 1 6.5 q3.5 .5 4.5 -2 q-3 -1 -5.5 -4.5 z" fill={hColor} />
        <circle cx="79.5" cy="22.5" r="1.6" fill="#fff" />
        <circle cx="80" cy="22.7" r="0.9" fill={GOGGLE} />
        <path d="M83.5 25.5 q-2 1.6 -4 .8" stroke={mouth} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <circle cx="76" cy="27" r="2.2" fill="rgba(255,120,150,0.35)" />
        <circle cx="71" cy="25" r="2.2" fill={skinShade} />
        <path d="M61.5 20.5 a12 12 0 0 1 22.5 -4.5 q-12 -4 -22.5 4.5 z" fill={cap} />
        <path d="M62.5 18.5 a12 12 0 0 1 20 -3.5" fill="none" stroke={capShade} strokeWidth="1.4" opacity="0.7" />
        <ellipse cx="72" cy="11.5" rx="4.4" ry="2.3" fill="rgba(255,255,255,0.4)" transform="rotate(-18 72 11.5)" />
        <path d="M74 19.5 q4.5 -3.5 9 -1.5" stroke={GOGGLE} strokeWidth="1.6" fill="none" />
        <rect x="76" y="18.5" width="8" height="6.4" rx="3.2" fill={GLASS} stroke={GOGGLE} strokeWidth="1.4" />
        <circle cx="79" cy="21" r="1.2" fill="#fff" opacity="0.9" />
        <path d="M12 38 q4 -3 8 0" stroke={GLASS} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="18" cy="43" r="2" fill={GLASS} />
        <circle cx="28" cy="46" r="1.5" fill={GLASS} />
        <circle cx="10" cy="33" r="1.3" fill={GLASS} />
        <circle cx="92" cy="35" r="1.6" fill={GLASS} />
        <circle cx="87" cy="40" r="1.1" fill={GLASS} />
      </svg>
    );
  }

  /* ── stand / climb pose ────────────────────────────────────────────── */
  const height = Math.round(size * 1.3);
  const width = Math.round((height * 72) / 96);
  const svgStyle =
    pose === "climb" ? { transform: "rotate(-9deg)", transformOrigin: "bottom center" } : undefined;

  // ground shadow width varies with body shape
  const shadowRx = bs === "lean" ? 14 : bs === "strong" ? 19 : 16;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 72 96"
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 1 · ground shadow */}
      <ellipse cx="36" cy="92.5" rx={shadowRx} ry="3" fill="rgba(0,0,0,0.18)" />

      {/* 2 · back hair (long back panels, ponytail) — behind everything */}
      <HairBack style={hs} color={hColor} />

      {/* 3 · legs + feet */}
      <StandLegs shape={bs} skin={skin} skinShade={skinShade} />

      {/* 4 · arms (may be suit-colored for rash guard) */}
      <StandArms shape={bs} skin={skin} suitStyle={ss} suit={suit} />

      {/* 5 · neck */}
      <rect x="32.4" y="35.5" width="7.2" height="7" rx="3.2" fill={skinShade} />

      {/* 6 · suit torso */}
      <StandSuit shape={bs} style={ss} suit={suit} suitShade={suitShade} />

      {/* 7 · ears (in front of arms, behind head) */}
      <circle cx="21.6" cy="26.5" r="2.9" fill={skin} />
      <circle cx="50.4" cy="26.5" r="2.9" fill={skin} />
      <circle cx="21.9" cy="26.5" r="1.2" fill={skinShade} />
      <circle cx="50.1" cy="26.5" r="1.2" fill={skinShade} />

      {/* 8 · head */}
      <ellipse cx="36" cy="24.5" rx="14.6" ry="15.2" fill={skin} />

      {/* 9 · side hair tufts (in front of head, behind face) */}
      <HairSide style={hs} color={hColor} />

      {/* 10 · face: brows */}
      <path d="M26.8 22.2 q2.6 -1.6 5 -.4" stroke={hair} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M40.2 21.8 q2.4 -1.2 5 .4" stroke={hair} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <ellipse cx="29.6" cy="26.5" rx="2.7" ry="3.1" fill="#fff" />
      <ellipse cx="42.4" cy="26.5" rx="2.7" ry="3.1" fill="#fff" />
      <circle cx="30" cy="27" r="1.7" fill={mix(hair, "#000000", 0.25)} />
      <circle cx="42" cy="27" r="1.7" fill={mix(hair, "#000000", 0.25)} />
      <circle cx="30.6" cy="26.3" r="0.6" fill="#fff" />
      <circle cx="42.6" cy="26.3" r="0.6" fill="#fff" />
      {/* nose */}
      <path d="M35 30.5 q1 1.4 2 0" stroke={skinLine} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {/* smile */}
      <path d="M31.5 34 q4.5 3.8 9 0" stroke={mouth} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* blush */}
      <ellipse cx="26.5" cy="31.5" rx="2.6" ry="1.7" fill="rgba(255,120,150,0.35)" />
      <ellipse cx="45.5" cy="31.5" rx="2.6" ry="1.7" fill="rgba(255,120,150,0.35)" />

      {/* 11 · fringe peeking under cap */}
      <HairFringe style={hs} color={hColor} />

      {/* 12 · cap: dome + darker rim + shine */}
      <path d="M21.6 20.5 a14.6 15.2 0 0 1 28.8 0 q-14.4 -6.2 -28.8 0 z" fill={cap} />
      <path d="M22.4 18.6 a14.6 15.2 0 0 1 27.2 0" fill="none" stroke={capShade} strokeWidth="1.6" opacity="0.75" />
      <ellipse cx="29" cy="13" rx="5.6" ry="3" fill="rgba(255,255,255,0.4)" transform="rotate(-22 29 13)" />

      {/* 13 · goggles pushed up on cap */}
      <path d="M22.5 15.5 q13.5 -6.5 27 0" stroke={GOGGLE} strokeWidth="1.9" fill="none" />
      <rect x="26.5" y="10.8" width="8.6" height="6" rx="3" fill={GLASS} stroke={GOGGLE} strokeWidth="1.4" />
      <rect x="37" y="10.8" width="8.6" height="6" rx="3" fill={GLASS} stroke={GOGGLE} strokeWidth="1.4" />
      <line x1="35.1" y1="13.8" x2="37" y2="13.8" stroke={GOGGLE} strokeWidth="1.4" />
      <circle cx="29.2" cy="12.8" r="1.2" fill="#fff" opacity="0.9" />
      <circle cx="39.7" cy="12.8" r="1.2" fill="#fff" opacity="0.9" />

      {/* 14 · hair topper above cap (bun / ponytail tie) */}
      <HairTopper style={hs} color={hColor} />
    </svg>
  );
}
