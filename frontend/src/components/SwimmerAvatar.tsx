import type { Character } from "../data/characters";

export type SwimmerPose = "stand" | "swim" | "climb";

interface SwimmerAvatarProps {
  character: Character;
  pose: SwimmerPose;
  size?: number;
  className?: string;
}

/**
 * A small, cute SVG swimmer avatar built entirely from shapes (no external
 * art assets). "stand"/"climb" render an upright figure for the deck;
 * "swim" renders a horizontal figure with an arm stroke for in-lane swimming.
 */
export default function SwimmerAvatar({ character, pose, size = 56, className }: SwimmerAvatarProps) {
  const { skin, suit, cap } = character;

  if (pose === "swim") {
    return (
      <svg
        className={className}
        width={size * 1.6}
        height={size}
        viewBox="0 0 90 56"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* trailing arm */}
        <ellipse cx="68" cy="30" rx="11" ry="5" fill={skin} transform="rotate(18 68 30)" />
        {/* body */}
        <ellipse cx="42" cy="30" rx="26" ry="11" fill={suit} />
        {/* leading arm reaching forward */}
        <ellipse cx="14" cy="24" rx="12" ry="5" fill={skin} transform="rotate(-10 14 24)" />
        {/* head */}
        <circle cx="68" cy="22" r="12" fill={skin} />
        {/* cap */}
        <path d="M58 18 a10 10 0 0 1 20 0 z" fill={cap} />
        {/* goggles */}
        <circle cx="73" cy="22" r="3.4" fill="#fff" stroke="#2b2b2b" strokeWidth="1.2" />
        {/* splash */}
        <circle cx="20" cy="42" r="2" fill="#bfe9f7" />
        <circle cx="28" cy="46" r="1.4" fill="#bfe9f7" />
        <circle cx="12" cy="38" r="1.2" fill="#bfe9f7" />
      </svg>
    );
  }

  const tilt = pose === "climb" ? -8 : 0;

  return (
    <svg
      className={className}
      width={size}
      height={size * 1.3}
      viewBox="0 0 56 72"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* legs */}
      <rect x="18" y="52" width="7" height="18" rx="3.5" fill={skin} />
      <rect x="31" y="52" width="7" height="18" rx="3.5" fill={skin} />
      {/* body */}
      <rect x="14" y="28" width="28" height="28" rx="12" fill={suit} />
      {/* arms */}
      <ellipse cx="10" cy="38" rx="5" ry="11" fill={skin} />
      <ellipse cx="46" cy="38" rx="5" ry="11" fill={skin} />
      {/* head */}
      <circle cx="28" cy="16" r="14" fill={skin} />
      {/* cap */}
      <path d="M14 14 a14 14 0 0 1 28 0 z" fill={cap} />
      {/* goggles */}
      <circle cx="23" cy="17" r="3.2" fill="#fff" stroke="#2b2b2b" strokeWidth="1.1" />
      <circle cx="33" cy="17" r="3.2" fill="#fff" stroke="#2b2b2b" strokeWidth="1.1" />
      <line x1="26.2" y1="17" x2="29.8" y2="17" stroke="#2b2b2b" strokeWidth="1.1" />
    </svg>
  );
}
