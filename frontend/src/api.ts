import type {
  AppNotification,
  AuthResponse,
  ChatMessage,
  FriendRequest,
  FriendRequests,
  FriendSearchHit,
  FriendView,
  LeaderboardEntry,
  ScheduleResponse,
  SwimInvite,
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
  const res = await fetch(`${API_BASE}/api/swim-records`, { headers: authHeaders() });
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

/** Asks the backend for a provider authorize URL (Google / Facebook). */
export async function fetchOAuthUrl(provider: "google" | "facebook"): Promise<string> {
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

// ===================== friends =====================

export async function fetchFriends(): Promise<FriendView[]> {
  const res = await fetch(`${API_BASE}/api/friends`, { headers: authHeaders() });
  if (!res.ok) await failure(res, "Couldn't load your friends.");
  return res.json();
}

export async function searchUsers(q: string): Promise<FriendSearchHit[]> {
  const res = await fetch(`${API_BASE}/api/friends/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) await failure(res, "Search failed.");
  return res.json();
}

export async function fetchFriendRequests(): Promise<FriendRequests> {
  const res = await fetch(`${API_BASE}/api/friends/requests`, { headers: authHeaders() });
  if (!res.ok) await failure(res, "Couldn't load friend requests.");
  return res.json();
}

export async function sendFriendRequest(userId: number): Promise<FriendRequest> {
  const res = await fetch(`${API_BASE}/api/friends/requests`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) await failure(res, "Couldn't send the friend request.");
  return res.json();
}

export async function respondFriendRequest(
  requestId: number,
  action: "accept" | "decline",
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/friends/requests/${requestId}/${action}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await failure(res, "Couldn't update the friend request.");
}

export async function unfriend(friendUserId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/friends/${friendUserId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) await failure(res, "Couldn't remove this friend.");
}

/** A friend's full swim history — the "check their records" view. */
export async function fetchFriendRecords(friendUserId: number): Promise<SwimRecord[]> {
  const res = await fetch(`${API_BASE}/api/friends/${friendUserId}/records`, {
    headers: authHeaders(),
  });
  if (!res.ok) await failure(res, "Couldn't load your friend's records.");
  return res.json();
}

// ===================== messages =====================

export async function fetchConversation(friendId: number): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/api/messages/${friendId}`, { headers: authHeaders() });
  if (!res.ok) await failure(res, "Couldn't load the conversation.");
  return res.json();
}

export async function sendChatMessage(friendId: number, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/api/messages/${friendId}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) await failure(res, "Couldn't send the message.");
  return res.json();
}

/** Unread DM counts keyed by sender id (friend-list badges). */
export async function fetchUnreadMessageCounts(): Promise<Record<number, number>> {
  const res = await fetch(`${API_BASE}/api/messages/unread`, { headers: authHeaders() });
  if (!res.ok) await failure(res, "Couldn't load unread counts.");
  return res.json();
}

// ===================== swim invites =====================

export interface CreateInvitePayload {
  friendId: number;
  sessionStart: string; // "yyyy-MM-dd HH:mm:ss"
  sessionEnd: string;
  poolLength: 25 | 50;
  note?: string;
}

export async function fetchInvites(): Promise<SwimInvite[]> {
  const res = await fetch(`${API_BASE}/api/invites`, { headers: authHeaders() });
  if (!res.ok) await failure(res, "Couldn't load swim invites.");
  return res.json();
}

export async function sendSwimInvite(payload: CreateInvitePayload): Promise<SwimInvite> {
  const res = await fetch(`${API_BASE}/api/invites`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await failure(res, "Couldn't send the invite.");
  return res.json();
}

export async function respondInvite(
  inviteId: number,
  action: "accept" | "decline",
): Promise<SwimInvite> {
  const res = await fetch(`${API_BASE}/api/invites/${inviteId}/${action}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await failure(res, "Couldn't respond to the invite.");
  return res.json();
}

// ===================== notifications =====================

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await fetch(`${API_BASE}/api/notifications`, { headers: authHeaders() });
  if (!res.ok) await failure(res, "Couldn't load notifications.");
  return res.json();
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/notifications/unread-count`, {
    headers: authHeaders(),
  });
  if (!res.ok) await failure(res, "Couldn't load notifications.");
  const data: { count: number } = await res.json();
  return data.count;
}

export async function markNotificationsRead(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await failure(res, "Couldn't mark notifications read.");
}

// ===================== leaderboard =====================

export async function fetchTodayLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/api/leaderboard/today`);
  if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
  return res.json();
}
