import type { ScheduleResponse, SwimRecord } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

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
    headers: { "Content-Type": "application/json" },
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
