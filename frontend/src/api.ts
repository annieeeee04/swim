import type { ScheduleResponse } from "./types";

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
