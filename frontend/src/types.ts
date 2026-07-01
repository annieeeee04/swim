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
  provider: "LOCAL" | "GOOGLE" | "INSTAGRAM";
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
