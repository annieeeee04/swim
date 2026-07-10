import type { Character } from "../data/characters";
import type { UserSummary } from "../types";
import SwimmerAvatar from "./SwimmerAvatar";

/** A user's avatar colors as a Character for the 2D SwimmerAvatar. */
function userSummaryCharacter(u: UserSummary): Character {
  return {
    id: `user-${u.id}`,
    name: u.displayName,
    skin: u.avatarSkin,
    suit: u.avatarSuit,
    cap: u.avatarCap,
    modelUrl: "",
  };
}

/**
 * Round profile chip used everywhere another user appears: uploaded photo if
 * present, else their 2D swimmer avatar. One element, one look.
 */
export default function UserFace({ user, size = 40 }: { user: UserSummary; size?: number }) {
  return user.photoUrl ? (
    <img className="friend-face" src={user.photoUrl} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="friend-face friend-face-avatar" style={{ width: size, height: size }}>
      <SwimmerAvatar character={userSummaryCharacter(user)} pose="stand" size={size - 8} />
    </span>
  );
}
