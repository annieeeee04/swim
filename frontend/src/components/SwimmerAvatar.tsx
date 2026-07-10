import type { Character } from "../data/characters";

export type SwimmerPose = "stand" | "swim" | "climb";

interface SwimmerAvatarProps {
  character: Character;
  pose: SwimmerPose;
  size?: number;
  className?: string;
}

const GOGGLE = "#2e2a40";
const GLASS = "#bfe9f7";

/* ---------- tiny color helpers so every character self-shades ---------- */

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Mixes `hex` toward `target` by weight w (0..1). Falls back to `hex` on bad input. */
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
/** Natural hair tone derived from the chosen skin (darker skin → darker hair). */
const hairOf = (skin: string) => mix(skin, "#2f2013", 0.74);

/**
 * The brand's swimmer character, v2 — closer-to-life proportions, a real
 * face (eyes, brows, nose, smile), hair peeking out under the cap, goggles
 * pushed up on the forehead, and soft self-shading derived from the user's
 * chosen skin / suit / cap colors. Still 100% SVG primitives, still fully
 * recolorable, so whatever the user designs at signup is what swims.
 *
 * "stand"/"climb" render the upright figure (climb tilts forward);
 * "swim" renders a horizontal freestyle stroke with splash.
 */
export default function SwimmerAvatar({ character, pose, size = 56, className }: SwimmerAvatarProps) {
  const { skin, suit, cap } = character;
  const hair = hairOf(skin);
  const skinShade = shade(skin, 0.16);
  const skinLine = shade(skin, 0.34);
  const suitShade = shade(suit, 0.22);
  const capShade = shade(cap, 0.24);
  const mouth = shade(skin, 0.5);

  if (pose === "swim") {
    const width = Math.round(size * 1.55);
    const height = Math.round((width * 56) / 96);
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox="0 0 96 56"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* kicking legs (slight scissor) */}
        <path d="M34 30 L16 25.5 q-3 .8 -2.6 3 q.3 1.8 3 2 L34 33.5 z" fill={skinShade} />
        <path d="M34 31 L14 33.5 q-2.8 1 -2.2 3.2 q.5 1.9 3.2 1.6 L34 35 z" fill={skin} />
        {/* recovery arm arcing over the back */}
        <path
          d="M64 22 q-8 -12 -20 -10 q-2.6 .5 -2.2 2.8 q.4 2 2.8 2 q9 -1.2 15 7 z"
          fill={skin}
        />
        <circle cx="43" cy="13.5" r="3" fill={skin} />
        {/* torso in the suit */}
        <ellipse cx="50" cy="31" rx="20" ry="9.6" fill={suit} />
        <path d="M31 32.5 a19.5 9 0 0 0 38 0 l0 2 a19.5 8 0 0 1 -38 0 z" fill={suitShade} opacity="0.55" />
        <ellipse cx="44" cy="27" rx="8" ry="3" fill={tint(suit, 0.25)} opacity="0.6" />
        {/* lead arm reaching forward underwater */}
        <path d="M66 28 L90 26.5 q2.8 .3 2.8 2.6 q0 2.3 -2.8 2.4 L66 32 z" fill={skinShade} />
        <circle cx="90.5" cy="29" r="3" fill={skinShade} />
        {/* head, facing right */}
        <circle cx="73" cy="22" r="12" fill={skin} />
        {/* nape hair under the cap */}
        <path d="M62.5 24 q-1.5 4 1 6.5 q3.5 .5 4.5 -2 q-3 -1 -5.5 -4.5 z" fill={hair} />
        {/* profile face */}
        <circle cx="79.5" cy="22.5" r="1.6" fill="#fff" />
        <circle cx="80" cy="22.7" r="0.9" fill={GOGGLE} />
        <path d="M83.5 25.5 q-2 1.6 -4 .8" stroke={mouth} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <circle cx="76" cy="27" r="2.2" fill="rgba(255,120,150,0.35)" />
        {/* ear */}
        <circle cx="71" cy="25" r="2.2" fill={skinShade} />
        {/* cap over the top-back of the head */}
        <path d="M61.5 20.5 a12 12 0 0 1 22.5 -4.5 q-12 -4 -22.5 4.5 z" fill={cap} />
        <path d="M62.5 18.5 a12 12 0 0 1 20 -3.5" fill="none" stroke={capShade} strokeWidth="1.4" opacity="0.7" />
        <ellipse cx="72" cy="11.5" rx="4.4" ry="2.3" fill="rgba(255,255,255,0.4)" transform="rotate(-18 72 11.5)" />
        {/* goggles on the eyes (mid-swim) */}
        <path d="M74 19.5 q4.5 -3.5 9 -1.5" stroke={GOGGLE} strokeWidth="1.6" fill="none" />
        <rect x="76" y="18.5" width="8" height="6.4" rx="3.2" fill={GLASS} stroke={GOGGLE} strokeWidth="1.4" />
        <circle cx="79" cy="21" r="1.2" fill="#fff" opacity="0.9" />
        {/* splash */}
        <path d="M12 38 q4 -3 8 0" stroke={GLASS} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="18" cy="43" r="2" fill={GLASS} />
        <circle cx="28" cy="46" r="1.5" fill={GLASS} />
        <circle cx="10" cy="33" r="1.3" fill={GLASS} />
        <circle cx="92" cy="35" r="1.6" fill={GLASS} />
        <circle cx="87" cy="40" r="1.1" fill={GLASS} />
      </svg>
    );
  }

  const height = Math.round(size * 1.3);
  const width = Math.round((height * 72) / 96);
  const style =
    pose === "climb" ? { transform: "rotate(-9deg)", transformOrigin: "bottom center" } : undefined;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 72 96"
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ground shadow */}
      <ellipse cx="36" cy="92.5" rx="16" ry="3" fill="rgba(0,0,0,0.18)" />

      {/* legs (slightly tapered, with inner shading) + feet */}
      <path d="M28.2 60 h7 l-1 22 q0 2.6 -2.6 2.6 q-2.6 0 -2.7 -2.6 z" fill={skin} />
      <path d="M36.8 60 h7 l-.7 22 q-.1 2.6 -2.7 2.6 q-2.6 0 -2.6 -2.6 z" fill={skin} />
      <path d="M33.4 62 l-.6 20 q1.6 .4 1.6 -1 l.6 -19 z" fill={skinShade} opacity="0.5" />
      <path d="M42 62 l-.5 20 q1.5 .4 1.6 -1 l.5 -19 z" fill={skinShade} opacity="0.5" />
      <ellipse cx="30.6" cy="85.5" rx="5" ry="2.9" fill={skin} />
      <ellipse cx="41.4" cy="85.5" rx="5" ry="2.9" fill={skin} />

      {/* arms relaxed at the sides, hands open */}
      <path d="M20 42 q-4.5 3 -5.5 10 q-.8 6 1.6 10.5 q1.8 2.6 3.8 .8 q1.6 -1.8 .9 -4.5 q-1.4 -6 .8 -13 z" fill={skin} />
      <path d="M52 42 q4.5 3 5.5 10 q.8 6 -1.6 10.5 q-1.8 2.6 -3.8 .8 q-1.6 -1.8 -.9 -4.5 q1.4 -6 -.8 -13 z" fill={skin} />
      <circle cx="18" cy="64.5" r="3.1" fill={skin} />
      <circle cx="54" cy="64.5" r="3.1" fill={skin} />

      {/* neck */}
      <rect x="32.4" y="35.5" width="7.2" height="7" rx="3.2" fill={skinShade} />

      {/* swimsuit torso: shoulders → gentle waist → hips */}
      <path
        d="M25 41 q11 -3.5 22 0 q4.5 1.6 4.5 7.5 q0 5 -1.6 9 q-1.8 10.5 -13.9 10.5 q-12.1 0 -13.9 -10.5 q-1.6 -4 -1.6 -9 q0 -5.9 4.5 -7.5 z"
        fill={suit}
      />
      <path
        d="M23.5 58 q3.5 8 12.5 8 q9 0 12.5 -8 q-1 9.5 -12.5 9.5 q-11.5 0 -12.5 -9.5 z"
        fill={suitShade}
        opacity="0.6"
      />
      <ellipse cx="29" cy="47.5" rx="3.4" ry="6.5" fill={tint(suit, 0.28)} opacity="0.55" />
      {/* straps */}
      <rect x="26" y="33.5" width="4.4" height="11" rx="2.2" fill={suit} />
      <rect x="41.6" y="33.5" width="4.4" height="11" rx="2.2" fill={suit} />
      <rect x="26" y="33.5" width="4.4" height="3" rx="1.5" fill={suitShade} opacity="0.5" />
      <rect x="41.6" y="33.5" width="4.4" height="3" rx="1.5" fill={suitShade} opacity="0.5" />

      {/* ears */}
      <circle cx="21.6" cy="26.5" r="2.9" fill={skin} />
      <circle cx="50.4" cy="26.5" r="2.9" fill={skin} />
      <circle cx="21.9" cy="26.5" r="1.2" fill={skinShade} />
      <circle cx="50.1" cy="26.5" r="1.2" fill={skinShade} />

      {/* head */}
      <ellipse cx="36" cy="24.5" rx="14.6" ry="15.2" fill={skin} />

      {/* side hair tufts under the cap */}
      <path d="M22.4 20 q-2.4 7 .8 12 q3 -1.4 2.4 -6 q-.5 -3.6 -3.2 -6 z" fill={hair} />
      <path d="M49.6 20 q2.4 7 -.8 12 q-3 -1.4 -2.4 -6 q.5 -3.6 3.2 -6 z" fill={hair} />

      {/* face: brows, eyes with iris + catchlight, nose, smile, blush */}
      <path d="M26.8 22.2 q2.6 -1.6 5 -.4" stroke={hair} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M40.2 21.8 q2.4 -1.2 5 .4" stroke={hair} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <ellipse cx="29.6" cy="26.5" rx="2.7" ry="3.1" fill="#fff" />
      <ellipse cx="42.4" cy="26.5" rx="2.7" ry="3.1" fill="#fff" />
      <circle cx="30" cy="27" r="1.7" fill={mix(hair, "#000000", 0.25)} />
      <circle cx="42" cy="27" r="1.7" fill={mix(hair, "#000000", 0.25)} />
      <circle cx="30.6" cy="26.3" r="0.6" fill="#fff" />
      <circle cx="42.6" cy="26.3" r="0.6" fill="#fff" />
      <path d="M35 30.5 q1 1.4 2 0" stroke={skinLine} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M31.5 34 q4.5 3.8 9 0" stroke={mouth} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <ellipse cx="26.5" cy="31.5" rx="2.6" ry="1.7" fill="rgba(255,120,150,0.35)" />
      <ellipse cx="45.5" cy="31.5" rx="2.6" ry="1.7" fill="rgba(255,120,150,0.35)" />

      {/* fringe peeking out under the cap edge */}
      <path
        d="M25 18.6 q3 3.4 6 .8 q2.6 3 5 .4 q2.4 2.6 5 .2 q3 2.4 5.6 -1 q-4 -4.6 -10.8 -4.8 q-7 -.2 -10.8 4.4 z"
        fill={hair}
      />

      {/* cap: dome + darker rim + shine */}
      <path d="M21.6 20.5 a14.6 15.2 0 0 1 28.8 0 q-14.4 -6.2 -28.8 0 z" fill={cap} />
      <path d="M22.4 18.6 a14.6 15.2 0 0 1 27.2 0" fill="none" stroke={capShade} strokeWidth="1.6" opacity="0.75" />
      <ellipse cx="29" cy="13" rx="5.6" ry="3" fill="rgba(255,255,255,0.4)" transform="rotate(-22 29 13)" />

      {/* goggles pushed up on the cap */}
      <path d="M22.5 15.5 q13.5 -6.5 27 0" stroke={GOGGLE} strokeWidth="1.9" fill="none" />
      <rect x="26.5" y="10.8" width="8.6" height="6" rx="3" fill={GLASS} stroke={GOGGLE} strokeWidth="1.4" />
      <rect x="37" y="10.8" width="8.6" height="6" rx="3" fill={GLASS} stroke={GOGGLE} strokeWidth="1.4" />
      <line x1="35.1" y1="13.8" x2="37" y2="13.8" stroke={GOGGLE} strokeWidth="1.4" />
      <circle cx="29.2" cy="12.8" r="1.2" fill="#fff" opacity="0.9" />
      <circle cx="39.7" cy="12.8" r="1.2" fill="#fff" opacity="0.9" />
    </svg>
  );
}
