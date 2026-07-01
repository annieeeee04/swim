/**
 * Auto-generates a starter swimmer avatar from the gender + age a user gives
 * at signup. It's deterministic (same inputs -> same look) so the generated
 * character feels "assigned", but every color can still be tweaked afterwards
 * in the avatar designer. Only skin/suit/cap drive the 2D SwimmerAvatar.
 */

export interface AvatarLook {
  skin: string;
  suit: string;
  cap: string;
  /** id of the palette family this look came from, stored for reference. */
  base: string;
}

export const SKIN_TONES = ["#f7d9bd", "#f3c89e", "#e7b48a", "#d29b6e", "#a8714a", "#7d4f2e"];

/** Suit/cap families. Gender nudges the starting family; age shifts the shade. */
const FAMILIES: { id: string; suit: string; cap: string }[] = [
  { id: "rose", suit: "#ec4899", cap: "#be185d" },
  { id: "violet", suit: "#a855f7", cap: "#6d28d9" },
  { id: "sky", suit: "#38bdf8", cap: "#0369a1" },
  { id: "teal", suit: "#14b8a6", cap: "#0f766e" },
  { id: "amber", suit: "#f59e0b", cap: "#b45309" },
  { id: "emerald", suit: "#22c55e", cap: "#15803d" },
  { id: "coral", suit: "#f43f5e", cap: "#9f1239" },
  { id: "indigo", suit: "#6366f1", cap: "#3730a3" },
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateAvatar(gender: string, age: number | null): AvatarLook {
  const g = (gender || "other").toLowerCase();
  const seed = hashString(`${g}|${age ?? 0}`);

  // Gender gives a soft starting bias across the color wheel; the hash then
  // personalizes within that bias so two people of the same gender/age differ
  // only if their other inputs differ.
  const genderBias = g.startsWith("f") ? 0 : g.startsWith("m") ? 2 : 4;
  const family = FAMILIES[(genderBias + (seed % FAMILIES.length)) % FAMILIES.length];

  // Age picks a skin tone deterministically (just for variety, not literal).
  // NOTE: use the UNSIGNED shift (>>>) — a signed >> can go negative for large
  // seeds, yielding a negative index and an undefined skin tone.
  const skin = SKIN_TONES[(seed >>> 3) % SKIN_TONES.length];

  return { skin, suit: family.suit, cap: family.cap, base: family.id };
}

export const SUIT_SWATCHES = FAMILIES.map((f) => f.suit);
export const CAP_SWATCHES = FAMILIES.map((f) => f.cap);
