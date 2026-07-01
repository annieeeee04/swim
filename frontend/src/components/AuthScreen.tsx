import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { fetchOAuthUrl, uploadPhoto } from "../api";
import { generateAvatar, type AvatarLook } from "../utils/generateAvatar";
import AvatarDesigner from "./AvatarDesigner";
import SwimSchool from "./SwimSchool";

type Mode = "login" | "signup";

const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];

export default function AuthScreen() {
  const { login, signup, setUser, oauthError } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  // shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // signup-only
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [look, setLook] = useState<AvatarLook>(() => generateAvatar("other", null));
  const [avatarTouched, setAvatarTouched] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (oauthError) setError(`Social login failed (${oauthError}). Try again or use email.`);
  }, [oauthError]);

  // Auto-generate the avatar from gender + age until the user hand-edits it.
  useEffect(() => {
    if (avatarTouched) return;
    if (!gender && !age) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLook(generateAvatar(gender || "other", age ? Number(age) : null));
  }, [gender, age, avatarTouched]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
        return;
      }
      await signup({
        email,
        password,
        displayName,
        gender,
        age: age ? Number(age) : null,
        avatarSkin: look.skin,
        avatarSuit: look.suit,
        avatarCap: look.cap,
        avatarBase: look.base,
      });
      // Photo is uploaded after the account exists (records/leaderboard only).
      if (photo) {
        try {
          const updated = await uploadPhoto(photo);
          setUser(updated);
        } catch {
          /* non-fatal — they can add a photo later from their profile */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSocial(provider: "google" | "facebook") {
    setError(null);
    try {
      const url = await fetchOAuthUrl(provider);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't start ${provider} login.`);
    }
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is too large (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  return (
    <div className="auth-screen">
      <SwimSchool count={6} seed={9} fixed className="auth-school" />

      <div className="auth-card glass-surface" data-glass>
        <div className="auth-head">
          <span className="auth-kicker">UBC AQUATIC CENTRE</span>
          <h1 className="auth-title">{mode === "login" ? "Welcome back" : "Join the pool"}</h1>
          <p className="auth-sub">
            {mode === "login"
              ? "Sign in to log swims and climb today's ranking."
              : "Tell us a bit about you and we'll spin up your swimmer."}
          </p>
        </div>

        <div className="auth-social">
          <button type="button" className="social-btn" onClick={() => handleSocial("google")}>
            <span className="social-glyph" aria-hidden="true">G</span> Continue with Google
          </button>
          <button type="button" className="social-btn social-btn-fb" onClick={() => handleSocial("facebook")}>
            <span className="social-glyph" aria-hidden="true">f</span> Login with Facebook
          </button>
        </div>

        <div className="auth-divider"><span>or {mode === "login" ? "sign in" : "sign up"} with email</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@ubc.ca"
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            />
          </label>

          {mode === "signup" && (
            <>
              <label className="auth-field">
                <span>Display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="What should the leaderboard call you?"
                />
              </label>

              <div className="auth-field-row">
                <label className="auth-field">
                  <span>Gender</span>
                  <select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Select…</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="auth-field">
                  <span>Age</span>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="—"
                  />
                </label>
              </div>

              <div className="auth-avatar-block">
                <div className="auth-avatar-head">
                  <span className="auth-section-label">Your swimmer</span>
                  <span className="auth-section-hint">auto-made from your info — tweak it freely</span>
                </div>
                <div onPointerDown={() => setAvatarTouched(true)}>
                  <AvatarDesigner look={look} onChange={(l) => setLook(l)} />
                </div>
              </div>

              <div className="auth-photo-block">
                <span className="auth-section-label">Profile photo</span>
                <span className="auth-section-hint">optional · shown on records &amp; ranking only</span>
                <div className="auth-photo-row">
                  <div className="auth-photo-preview" aria-hidden="true">
                    {photo ? <img src={photo} alt="" /> : <span>🙂</span>}
                  </div>
                  <label className="auth-photo-btn">
                    {photo ? "Change photo" : "Upload photo"}
                    <input type="file" accept="image/*" onChange={handlePhoto} hidden />
                  </label>
                  {photo && (
                    <button type="button" className="auth-photo-clear" onClick={() => setPhoto(null)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "Just a sec…" : mode === "login" ? "Sign in" : "Create account & dive in"}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
