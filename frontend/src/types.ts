export interface SwimEvent {
  eventId: string;
  // The UBC feed can occasionally return null/absent title or facilityName,
  // so these are nullable and every consumer guards before using them.
  title?: string | null;
  serviceName: string;
  facilityName?: string | null;
  facilityType?: string | null;
  start: string; // "yyyy-MM-dd HH:mm:ss" in America/Vancouver local time
  end: string;
  description?: string | null;
  curl?: string | null;
  capacity?: number | null;
}

export interface ScheduleResponse {
  events: SwimEvent[];
  lastUpdated: string; // ISO instant
}

export type PoolFilter = "all" | "25m" | "50m";

export interface SwimRecord {
  id: number;
  character: string;
  poolLength: 25 | 50;
  lane: number;
  distanceMeters: number | null;
  startedAt: string;
  completedAt: string | null;
  userId?: number | null;
}

export interface User {
  id: number;
  email: string;
  displayName: string;
  provider: "LOCAL" | "GOOGLE" | "FACEBOOK";
  gender: string | null;
  age: number | null;
  avatarSkin: string | null;
  avatarSuit: string | null;
  avatarCap: string | null;
  avatarBase: string | null;
  /** Uploaded profile photo (data URL). Records/leaderboard only — never in-pool. */
  photoUrl: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ===================== social =====================

/** The tiny public slice of another user (friend cards, chat, invites). */
export interface UserSummary {
  id: number;
  displayName: string;
  avatarSkin: string;
  avatarSuit: string;
  avatarCap: string;
  photoUrl: string | null;
}

export interface FriendView {
  user: UserSummary;
  /** True when the friend has an active (unfinished) swim right now. */
  inPool: boolean;
  lane: number | null;
  poolLength: 25 | 50 | null;
  friendsSince: string;
}

export interface FriendSearchHit {
  user: UserSummary;
  relation: "none" | "friends" | "requested" | "incoming";
}

export interface FriendRequest {
  id: number;
  user: UserSummary;
  createdAt: string;
}

export interface FriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export interface ChatMessage {
  id: number;
  senderId: number;
  recipientId: number;
  body: string;
  sentAt: string;
  readAt: string | null;
}

export type InviteStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface SwimInvite {
  id: number;
  direction: "incoming" | "outgoing";
  friend: UserSummary;
  sessionStart: string; // "yyyy-MM-dd HH:mm:ss"
  sessionEnd: string;
  poolLength: 25 | 50;
  note: string | null;
  status: InviteStatus;
  createdAt: string;
}

export type NotificationType =
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "MESSAGE"
  | "INVITE"
  | "INVITE_ACCEPTED"
  | "INVITE_DECLINED"
  | "FRIEND_IN_POOL";

export interface AppNotification {
  id: number;
  userId: number;
  type: NotificationType;
  text: string;
  refId: number | null;
  createdAt: string;
  readAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number | null;
  displayName: string;
  photoUrl: string | null;
  avatarSkin: string;
  avatarSuit: string;
  avatarCap: string;
  totalMeters: number;
  swims: number;
  best: number;
  demo: boolean;
}
