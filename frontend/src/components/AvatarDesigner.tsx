import type { Character } from "../data/characters";
import {
  CAP_SWATCHES,
  HAIR_COLORS,
  SKIN_TONES,
  SUIT_SWATCHES,
  type AvatarLook,
  type BodyShape,
  type HairStyle,
  type SuitStyle,
} from "../utils/generateAvatar";
import SwimmerAvatar, { type SwimmerPose } from "./SwimmerAvatar";

interface AvatarDesignerProps {
  look: AvatarLook;
  onChange: (look: AvatarLook) => void;
  /** Preview pose; defaults to a friendly standing figure. */
  pose?: SwimmerPose;
  size?: number;
}

function toCharacter(look: AvatarLook): Character {
  return { id: "me", name: "You", skin: look.skin, suit: look.suit, cap: look.cap, modelUrl: "" };
}

/* ─── color swatches ─────────────────────────────────────────────────── */

function Swatches({
  label,
  colors,
  active,
  onPick,
}: {
  label: string;
  colors: string[];
  active: string;
  onPick: (c: string) => void;
}) {
  const activeColor = (active ?? "").toLowerCase();
  return (
    <div className="designer-row">
      <span className="designer-label">{label}</span>
      <div className="designer-swatches">
        {colors.map((c, i) => {
          if (!c) return null;
          return (
            <button
              key={c ?? i}
              type="button"
              className={`designer-swatch ${activeColor === c.toLowerCase() ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => onPick(c)}
              aria-label={`${label} ${c}`}
            />
          );
        })}
        <label className="designer-custom" style={{ background: active }}>
          <input
            type="color"
            value={active}
            onChange={(e) => onPick(e.target.value)}
            aria-label={`Custom ${label.toLowerCase()} color`}
          />
        </label>
      </div>
    </div>
  );
}

/* ─── pill option picker ─────────────────────────────────────────────── */

function Pills<T extends string>({
  label,
  options,
  active,
  onPick,
}: {
  label: string;
  options: { id: T; label: string }[];
  active: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="designer-row">
      <span className="designer-label">{label}</span>
      <div className="designer-pills">
        {options.map(({ id, label: lbl }) => (
          <button
            key={id}
            type="button"
            className={`designer-pill ${active === id ? "active" : ""}`}
            onClick={() => onPick(id)}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── option sets ────────────────────────────────────────────────────── */

const BODY_SHAPE_OPTIONS: { id: BodyShape; label: string }[] = [
  { id: "lean",     label: "Lean" },
  { id: "athletic", label: "Athletic" },
  { id: "strong",   label: "Strong" },
];

const HAIR_STYLE_OPTIONS: { id: HairStyle; label: string }[] = [
  { id: "buzz",     label: "Buzz" },
  { id: "short",    label: "Short" },
  { id: "wavy",     label: "Wavy" },
  { id: "long",     label: "Long" },
  { id: "bun",      label: "Bun" },
  { id: "ponytail", label: "Tail" },
];

const SUIT_STYLE_OPTIONS: { id: SuitStyle; label: string }[] = [
  { id: "classic", label: "One-piece" },
  { id: "racer",   label: "Racer" },
  { id: "shorts",  label: "Shorts" },
  { id: "rash",    label: "Rash guard" },
];

/* ─── main designer component ────────────────────────────────────────── */

/**
 * Lets a user fine-tune their swimmer: body shape, hair, swimsuit cut,
 * skin / suit / cap colors — with a live preview. Stardew-Valley-style
 * character customization for the pool.
 */
export default function AvatarDesigner({ look, onChange, pose = "stand", size = 84 }: AvatarDesignerProps) {
  return (
    <div className="avatar-designer">
      <div className="designer-preview">
        <SwimmerAvatar
          character={toCharacter(look)}
          pose={pose}
          size={size}
          bodyShape={look.bodyShape}
          hairStyle={look.hairStyle}
          hairColor={look.hairColor}
          suitStyle={look.suitStyle}
        />
      </div>
      <div className="designer-controls">
        {/* ── body ── */}
        <Pills
          label="Build"
          options={BODY_SHAPE_OPTIONS}
          active={look.bodyShape}
          onPick={(bodyShape) => onChange({ ...look, bodyShape })}
        />

        {/* ── hair ── */}
        <Pills
          label="Hair style"
          options={HAIR_STYLE_OPTIONS}
          active={look.hairStyle}
          onPick={(hairStyle) => onChange({ ...look, hairStyle })}
        />
        <Swatches
          label="Hair color"
          colors={HAIR_COLORS}
          active={look.hairColor}
          onPick={(hairColor) => onChange({ ...look, hairColor })}
        />

        {/* ── suit ── */}
        <Pills
          label="Suit style"
          options={SUIT_STYLE_OPTIONS}
          active={look.suitStyle}
          onPick={(suitStyle) => onChange({ ...look, suitStyle })}
        />
        <Swatches
          label="Suit color"
          colors={SUIT_SWATCHES}
          active={look.suit}
          onPick={(suit) => onChange({ ...look, suit })}
        />

        {/* ── cap & skin ── */}
        <Swatches label="Cap" colors={CAP_SWATCHES} active={look.cap} onPick={(cap) => onChange({ ...look, cap })} />
        <Swatches label="Skin" colors={SKIN_TONES} active={look.skin} onPick={(skin) => onChange({ ...look, skin })} />
      </div>
    </div>
  );
}
