import type { Character } from "../data/characters";

export type SwimmerPose = "stand" | "swim" | "climb";

interface SwimmerAvatarProps {
  character: Character;
  pose: SwimmerPose;
  size?: number;
  className?: string;
}

const GOGGLE = "#3a3550";
const GLASS = "#bfe9f7";
const MOUTH = "#5a4a6a";
const BLUSH = "rgba(255,120,150,0.42)";

/**
 * The brand's signature chibi swimmer — big head, soft rounded body, a
 * shiny cap with a highlight band, framed goggles with lens glints, blush
 * cheeks, and a smile. Drawn entirely from SVG primitives (no art assets),
 * recolored per character via skin/suit/cap. Matches the "Mark & swimmers"
 * spec in the UBC Length Swim Design System.
 *
 * "stand"/"climb" render the upright figure (climb adds a slight forward
 * tilt); "swim" renders a horizontal mid-stroke figure with splash droplets.
 */
export default function SwimmerAvatar({ character, pose, size = 56, className }: SwimmerAvatarProps) {
  const { skin, suit, cap } = character;

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
        {/* trailing arm */}
        <ellipse cx="74" cy="34" rx="12" ry="5" fill={skin} transform="rotate(20 74 34)" />
        {/* body */}
        <ellipse cx="46" cy="32" rx="27" ry="11.5" fill={suit} />
        <path d="M22 32 a24 11.5 0 0 0 48 0 z" fill="rgba(0,0,0,0.09)" />
        {/* leading arm reaching forward */}
        <ellipse cx="14" cy="25" rx="13" ry="5.4" fill={skin} transform="rotate(-12 14 25)" />
        {/* head */}
        <circle cx="72" cy="24" r="13" fill={skin} />
        <circle cx="66" cy="29" r="2.7" fill={BLUSH} />
        <path d="M61.5 30.5 q3.2 2.6 6.2 1.1" stroke={MOUTH} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* cap + shine */}
        <path d="M60.5 22 a13 13 0 0 1 23 -3 q-12 -4 -23 3 z" fill={cap} />
        <ellipse cx="74" cy="13.5" rx="4.6" ry="2.6" fill="rgba(255,255,255,0.4)" transform="rotate(-20 74 13.5)" />
        {/* goggles */}
        <path d="M74 21 q4 -5 9 -3" stroke={GOGGLE} strokeWidth="1.8" fill="none" />
        <rect x="73.5" y="20" width="8" height="6.6" rx="3.3" fill={GLASS} stroke={GOGGLE} strokeWidth="1.4" />
        <circle cx="76.5" cy="22.6" r="1.3" fill="#fff" opacity="0.85" />
        {/* splash */}
        <circle cx="20" cy="43" r="2.2" fill={GLASS} />
        <circle cx="30" cy="47" r="1.6" fill={GLASS} />
        <circle cx="12" cy="37" r="1.4" fill={GLASS} />
        <circle cx="38" cy="45" r="1.1" fill={GLASS} />
      </svg>
    );
  }

  const height = Math.round(size * 1.3);
  const width = Math.round((height * 72) / 96);
  const style = pose === "climb" ? { transform: "rotate(-9deg)", transformOrigin: "bottom center" } : undefined;

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
      <ellipse cx="36" cy="92" rx="17" ry="3.4" fill="rgba(44,35,80,0.08)" />
      {/* legs + feet */}
      <rect x="28" y="62" width="7" height="19" rx="3.5" fill={skin} />
      <rect x="37" y="62" width="7" height="19" rx="3.5" fill={skin} />
      <ellipse cx="30.5" cy="82" rx="5" ry="3.1" fill={skin} />
      <ellipse cx="41.5" cy="82" rx="5" ry="3.1" fill={skin} />
      {/* arms */}
      <ellipse cx="16.5" cy="49" rx="5.4" ry="11.5" fill={skin} transform="rotate(9 16.5 49)" />
      <ellipse cx="55.5" cy="49" rx="5.4" ry="11.5" fill={skin} transform="rotate(-9 55.5 49)" />
      {/* shoulder straps */}
      <rect x="25" y="35" width="4.6" height="12" rx="2.3" fill={suit} />
      <rect x="42.4" y="35" width="4.6" height="12" rx="2.3" fill={suit} />
      {/* body + shading + shine */}
      <rect x="20" y="40" width="32" height="30" rx="14" fill={suit} />
      <path
        d="M22 60 a14 14 0 0 0 28 0 v2 a14 14 0 0 1 -14 8 a14 14 0 0 1 -14 -8 z"
        fill="rgba(0,0,0,0.09)"
      />
      <ellipse cx="28" cy="48" rx="3.6" ry="7.5" fill="rgba(255,255,255,0.20)" />
      {/* ears */}
      <circle cx="19.6" cy="27" r="3" fill={skin} />
      <circle cx="52.4" cy="27" r="3" fill={skin} />
      {/* head + blush + smile */}
      <circle cx="36" cy="26" r="17" fill={skin} />
      <circle cx="26.5" cy="34" r="3" fill={BLUSH} />
      <circle cx="45.5" cy="34" r="3" fill={BLUSH} />
      <path d="M31.5 36.5 q4.5 3.6 9 0" stroke={MOUTH} strokeWidth="1.7" fill="none" strokeLinecap="round" />
      {/* cap + highlight band + shine */}
      <path d="M20.4 27 a16 16 0 0 1 31.2 0 z" fill={cap} />
      <path d="M21.2 24.4 a16 16 0 0 1 29.6 0" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="2" />
      <ellipse cx="29" cy="15.5" rx="6" ry="3.4" fill="rgba(255,255,255,0.4)" transform="rotate(-22 29 15.5)" />
      {/* goggles */}
      <path d="M21.5 25.5 q14.5 -6 29 0" stroke={GOGGLE} strokeWidth="2" fill="none" />
      <rect x="24.5" y="24" width="9.5" height="8" rx="4" fill={GLASS} stroke={GOGGLE} strokeWidth="1.5" />
      <rect x="38" y="24" width="9.5" height="8" rx="4" fill={GLASS} stroke={GOGGLE} strokeWidth="1.5" />
      <line x1="34" y1="28" x2="38" y2="28" stroke={GOGGLE} strokeWidth="1.5" />
      <circle cx="27.2" cy="26.6" r="1.5" fill="#fff" opacity="0.85" />
      <circle cx="40.7" cy="26.6" r="1.5" fill="#fff" opacity="0.85" />
    </svg>
  );
}
