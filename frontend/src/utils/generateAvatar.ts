/**
 * Auto-generates a starter swimmer avatar from the gender + age a user gives
 * at signup. It's deterministic (same inputs -> same look) so the generated
 * character feels "assigned", but every option can still be tweaked afterwards
 * in the avatar designer. Skin/suit/cap drive colors; the new shape/hair/style
 * fields drive the SVG geometry.
 */

export type BodyShape = "lean" | "athletic" | "strong";
export type HairStyle = "buzz" | "short" | "wavy" | "long" | "bun" | "ponytail";
export type SuitStyle = "classic" | "racer" | "shorts" | "rash";

export interface AvatarLook {
  skin: string;
  suit: string;
  cap: string;
  /** id of the palette family this look came from, stored for reference. */
  base: string;
  bodyShape: BodyShape;
  hairStyle: HairStyle;
  /** Explicit hair color chosen by user (hex). Falls back to skin-derived if absent. */
  hairColor: string;
  suitStyle: SuitStyle;
}

export const SKIN_TONES = ["#f7d9bd", "#f3c89e", "#e7b48a", "#d29b6e", "#a8714a", "#7d4f2e"];

/** Hair color presets the user can pick from. */
export const HAIR_COLORS = [
  "#1a0a00", // jet black
  "#3b1d08", // dark brown
  "#6b3a2a", // medium brown
  "#a05c2c", // warm auburn
  "#c8902a", // golden brown
  "#f5d090", // honey blonde
  "#d94040", // red
  "#e8e8e8", // silver / white
];

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

const HAIR_STYLE_OPTIONS: HairStyle[] = ["buzz", "short", "wavy", "long", "bun", "ponytail"];

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
  // personalizes within that bias so two people of the same gender/age differ.
  const genderBias = g.startsWith("f") ? 0 : g.startsWith("m") ? 2 : 4;
  const family = FAMILIES[(genderBias + (seed % FAMILIES.length)) % FAMILIES.length];

  // Age picks a skin tone deterministically (just for variety, not literal).
  const skin = SKIN_TONES[(seed >>> 3) % SKIN_TONES.length];

  // Pick a hair color from the first 6 (avoid silver/red for auto-gen).
  const hairColor = HAIR_COLORS[(seed >>> 6) % 6];

  // Pick a hair style; bias toward shorter styles for the generated default.
  const hairStyleIdx = (seed >>> 9) % HAIR_STYLE_OPTIONS.length;
  // Weight toward short (index 1) for the generated default — just pick short.
  const hairStyle: HairStyle = "short";
  void hairStyleIdx; // reserved for future personalization

  return {
    skin,
    suit: family.suit,
    cap: family.cap,
    base: family.id,
    bodyShape: "athletic",
    hairStyle,
    hairColor,
    suitStyle: "classic",
  };
}

export const SUIT_SWATCHES = FAMILIES.map((f) => f.suit);
export const CAP_SWATCHES = FAMILIES.map((f) => f.cap);
