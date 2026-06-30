import type {
  AuthResponse,
  LeaderboardEntry,
  ScheduleResponse,
  SwimRecord,
  User,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

// ---- bearer token (kept in localStorage so sessions survive refreshes) ----
const TOKEN_KEY = "swim.token";
let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return authToken;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}

/** Pulls a readable message out of a failed Spring response when possible. */
async function failure(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body && typeof body.message === "string" && body.message) message = body.message;
  } catch {
    /* non-JSON error body — keep the fallback */
  }
  throw new Error(message);
}

export async function fetchSchedule(): Promise<ScheduleResponse> {
  const res = await fetch(`${API_BASE}/api/schedule`);
  if (!res.ok) {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  return res.json();
}

export async function refreshSchedule(): Promise<ScheduleResponse> {
  const res = await fetch(`${API_BASE}/api/schedule/refresh`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Starts a new swim. If `lane` is omitted, the backend assigns the first
 * free lane automatically; if provided, that exact lane is used (and the
 * call fails with a 409 if someone else just took it).
 */
export async function startSwim(
  character: string,
  poolLength: 25 | 50,
  lane?: number,
): Promise<SwimRecord> {
  const res = await fetch(`${API_BASE}/api/swim-records`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ character, poolLength, lane: lane ?? null }),
  });
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error("That lane was just taken — pick another one.");
    }
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  return res.json();
}

/** Lanes (1-10) currently occupied by an in-progress swim. */
export async function fetchOccupiedLanes(): Promise<number[]> {
  const res = await fetch(`${API_BASE}/api/swim-records/occupied-lanes`);
  if (!res.ok) {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  return res.json();
}

/** Records the real-world distance the user swam and marks the swim complete. */
export async function finishSwim(id: number, distanceMeters: number): Promise<SwimRecord> {
  const res = await fetch(`${API_BASE}/api/swim-records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ distanceMeters }),
  });
  if (!res.ok) {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSwimHistory(): Promise<SwimRecord[]> {
  const res = await fetch(`${API_BASE}/api/swim-records`);
  if (!res.ok) {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  return res.json();
}

// ===================== auth =====================

export interface SignupPayload {
  email: string;
  password: string;
  displayName: string;
  gender: string;
  age: number | null;
  avatarSkin: string;
  avatarSuit: string;
  avatarCap: string;
  avatarBase: string;
}

export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await failure(res, "Couldn't create your account.");
  const data: AuthResponse = await res.json();
  setAuthToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) await failure(res, "Invalid email or password.");
  const data: AuthResponse = await res.json();
  setAuthToken(data.token);
  return data;
}

export async function fetchMe(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
  if (!res.ok) await failure(res, "Session expired.");
  return res.json();
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", headers: authHeaders() });
  } finally {
    setAuthToken(null);
  }
}

export interface ProfilePatch {
  displayName?: string;
  gender?: string;
  age?: number | null;
  avatarSkin?: string;
  avatarSuit?: string;
  avatarCap?: string;
  avatarBase?: string;
}

export async function updateProfile(patch: ProfilePatch): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/profile`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) await failure(res, "Couldn't save your profile.");
  return res.json();
}

/** Upload (dataUrl) or clear (null) the profile photo. */
export async function uploadPhoto(dataUrl: string | null): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/photo`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ dataUrl }),
  });
  if (!res.ok) await failure(res, "Couldn't upload your photo.");
  return res.json();
}

/** Asks the backend for a provider authorize URL (Google / Instagram). */
export async function fetchOAuthUrl(provider: "google" | "instagram"): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/oauth/${provider}/url`);
  if (!res.ok) {
    if (res.status === 501) {
      await failure(res, `${provider} login isn't set up yet.`);
    }
    await failure(res, `Couldn't start ${provider} login.`);
  }
  const data: { authorizeUrl: string } = await res.json();
  return data.authorizeUrl;
}

// ===================== leaderboard =====================

export async function fetchTodayLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/api/leaderboard/today`);
  if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
  return res.json();
}
