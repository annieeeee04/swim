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

/** Starts a new swim: assigns a lane and creates a DB record. */
export async function startSwim(character: string, poolLength: 25 | 50): Promise<SwimRecord> {
  const res = await fetch(`${API_BASE}/api/swim-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character, poolLength }),
  });
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
