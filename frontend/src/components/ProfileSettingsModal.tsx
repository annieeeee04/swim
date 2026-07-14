import { useState, type ChangeEvent, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { updateProfile, uploadPhoto } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { AvatarLook } from "../utils/generateAvatar";
import AvatarDesigner from "./AvatarDesigner";
import SwimmerAvatar from "./SwimmerAvatar";

const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];

/**
 * Edit-your-profile sheet, opened by clicking your own avatar in the sidebar:
 * display name, gender, age, profile photo (upload / remove), and the swimmer
 * look (skin / suit / cap) that dives into the pool. Saves through the
 * existing profile + photo endpoints and refreshes the cached user.
 */
export default function ProfileSettingsModal({ onClose }: { onClose: () => void }) {
  const { user, setUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [gender, setGender] = useState(user?.gender ?? "");
  const [age, setAge] = useState(user?.age != null ? String(user.age) : "");
  const [look, setLook] = useState<AvatarLook>({
    skin: user?.avatarSkin ?? "#f3c89e",
    suit: user?.avatarSuit ?? "#ec4899",
    cap: user?.avatarCap ?? "#a855f7",
    base: user?.avatarBase ?? "classic",
    bodyShape: (user?.avatarBodyShape as AvatarLook["bodyShape"]) ?? "athletic",
    hairStyle: (user?.avatarHairStyle as AvatarLook["hairStyle"]) ?? "short",
    hairColor: user?.avatarHairColor ?? "#3b1d08",
    suitStyle: (user?.avatarSuitStyle as AvatarLook["suitStyle"]) ?? "classic",
  });
  /** undefined = untouched · string = new upload · null = remove photo */
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const shownPhoto = photo === undefined ? user.photoUrl : photo;

  function handlePhotoPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is too large (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Display name can't be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let updated = await updateProfile({
        displayName: displayName.trim(),
        gender,
        age: age ? Number(age) : null,
        avatarSkin: look.skin,
        avatarSuit: look.suit,
        avatarCap: look.cap,
        avatarBase: look.base,
        avatarBodyShape: look.bodyShape,
        avatarHairStyle: look.hairStyle,
        avatarHairColor: look.hairColor,
        avatarSuitStyle: look.suitStyle,
      });
      if (photo !== undefined) {
        updated = await uploadPhoto(photo);
      }
      setUser(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="invite-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.form
          className="invite-modal profile-modal profile-settings glass-surface"
          data-glass
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          onSubmit={handleSave}
        >
          <header className="profile-modal-head">
            <span className="settings-photo">
              {shownPhoto ? (
                <img src={shownPhoto} alt="" />
              ) : (
                <SwimmerAvatar
                  character={{ id: "me", name: "", skin: look.skin, suit: look.suit, cap: look.cap, modelUrl: "" }}
                  pose="stand"
                  size={54}
                  bodyShape={look.bodyShape}
                  hairStyle={look.hairStyle}
                  hairColor={look.hairColor}
                  suitStyle={look.suitStyle}
                />
              )}
            </span>
            <div>
              <h3>Edit profile</h3>
              <p className="settings-sub">How you appear across the app</p>
            </div>
            <button type="button" className="profile-modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </header>

          {error && <p className="error-state">⚠️ {error}</p>}

          <div className="settings-photo-actions">
            <label className="mini-btn">
              {shownPhoto ? "Change photo" : "Upload photo"}
              <input type="file" accept="image/*" hidden onChange={handlePhotoPick} />
            </label>
            {shownPhoto && (
              <button type="button" className="mini-btn mini-btn-ghost" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            )}
          </div>

          <label className="settings-field">
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="Your name in the app"
            />
          </label>

          <div className="settings-field-row">
            <label className="settings-field">
              <span>Gender</span>
              <select value={gender ?? ""} onChange={(e) => setGender(e.target.value)}>
                <option value="">Select…</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>Age</span>
              <input
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="—"
              />
            </label>
          </div>

          <div className="settings-designer">
            <span className="settings-label">Your swimmer</span>
            <AvatarDesigner look={look} onChange={setLook} size={92} />
          </div>

          <div className="profile-actions">
            <button className="length-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="mini-btn mini-btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
