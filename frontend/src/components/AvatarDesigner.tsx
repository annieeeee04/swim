import type { Character } from "../data/characters";
import { CAP_SWATCHES, SKIN_TONES, SUIT_SWATCHES, type AvatarLook } from "../utils/generateAvatar";
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
  // Defensive: never call string methods on a possibly-missing color.
  const activeColor = (active ?? "").toLowerCase();
  return (
    <div className="designer-row">
      <span className="designer-label">{label}</span>
      <div className="designer-swatches">
        {colors.map((c, i) => {
          if (!c) return null; // guard against undefined/null in the color list
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

/**
 * Lets a user fine-tune the auto-generated swimmer: skin tone, suit color, and
 * cap color, with a live preview. This is the avatar that enters the pool.
 */
export default function AvatarDesigner({ look, onChange, pose = "stand", size = 84 }: AvatarDesignerProps) {
  return (
    <div className="avatar-designer">
      <div className="designer-preview">
        <SwimmerAvatar character={toCharacter(look)} pose={pose} size={size} />
      </div>
      <div className="designer-controls">
        <Swatches label="Skin" colors={SKIN_TONES} active={look.skin} onPick={(skin) => onChange({ ...look, skin })} />
        <Swatches
          label="Suit"
          colors={SUIT_SWATCHES}
          active={look.suit}
          onPick={(suit) => onChange({ ...look, suit })}
        />
        <Swatches label="Cap" colors={CAP_SWATCHES} active={look.cap} onPick={(cap) => onChange({ ...look, cap })} />
      </div>
    </div>
  );
}
