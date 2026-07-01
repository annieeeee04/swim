import type { SwimEvent } from "../types";

export function isFiftyMeter(event: SwimEvent): boolean {
  return (event.title ?? "").toLowerCase().includes("50m");
}

/** A real, named pool/zone at the aquatic centre (not a numbered lane).
 *  Matches the facility-plan photo: 25m Recreation Pool, 50m Competition
 *  Pool (sometimes run as one pool, sometimes split by a bulkhead into
 *  North/South halves), and the irregular Leisure Pool + hot tub. */
export interface ZoneInfo {
  key: string;
  label: string;
  poolLength: 25 | 50 | null;
  count: number;
}

export interface ZoneClassification {
  key: string;
  label: string;
  poolLength: 25 | 50 | null;
}

/** Maps a raw facilityName string to one of the aquatic centre's real zones.
 *  Falls back to an "other" zone (keyed by the raw name) for anything that
 *  doesn't match a known pool, rather than inventing fake lane numbers. */
export function classifyZone(facilityName: string | null | undefined): ZoneClassification {
  const raw = facilityName ?? "";
  const name = raw.toLowerCase();
  if (name.includes("leisure")) {
    return { key: "leisure", label: "Leisure Pool", poolLength: null };
  }
  if (name.includes("hot tub")) {
    return { key: "hot-tub", label: "Hot Tub", poolLength: null };
  }
  if (name.includes("comp")) {
    if (name.includes("north")) return { key: "comp-north", label: "Competition Pool — North", poolLength: 50 };
    if (name.includes("south")) return { key: "comp-south", label: "Competition Pool — South", poolLength: 50 };
    return { key: "comp", label: "Competition Pool", poolLength: 50 };
  }
  if (name.includes("rec")) {
    return { key: "recreation", label: "Recreation Pool", poolLength: 25 };
  }
  return { key: `other:${raw}`, label: raw, poolLength: null };
}

/** "2026-06-21 07:30:00" -> "2026-06-21" */
export function dayKeyOf(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

/** Every distinct day present in the schedule, earliest first. */
export function listDays(events: SwimEvent[]): string[] {
  const days = new Set<string>();
  for (const ev of events) days.add(dayKeyOf(ev.start));
  return Array.from(days).sort();
}

export interface DayZoneSchedule {
  byZone: Map<string, SwimEvent[]>;
  zoneInfo: Record<string, ZoneInfo>;
}

/** Buckets a single day's events onto their real zones (already filtered to
 *  the selected day + pool-length filter by the caller). */
export function buildZoneSchedule(events: SwimEvent[]): DayZoneSchedule {
  const byZone = new Map<string, SwimEvent[]>();
  const labels = new Map<string, string>();
  const lengths = new Map<string, 25 | 50 | null>();

  for (const ev of events) {
    const { key, label, poolLength } = classifyZone(ev.facilityName);
    if (!byZone.has(key)) {
      byZone.set(key, []);
      labels.set(key, label);
      lengths.set(key, poolLength);
    }
    byZone.get(key)!.push(ev);
  }

  const zoneInfo: Record<string, ZoneInfo> = {};
  for (const [key, sessions] of byZone) {
    sessions.sort((a, b) => a.start.localeCompare(b.start));
    zoneInfo[key] = {
      key,
      label: labels.get(key)!,
      poolLength: lengths.get(key) ?? null,
      count: sessions.length,
    };
  }

  return { byZone, zoneInfo };
}
