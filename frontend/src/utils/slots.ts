import type { SwimEvent } from "../types";

export interface Slot {
  start: string;
  end: string;
  lengths: (25 | 50)[];
}

/** Groups the schedule into unique time slots (start–end), noting which pool
 *  length(s) are actually offered at each one — some slots only run a 25m
 *  session, others run 25m and 50m side by side. */
export function buildSlotsByDay(events: SwimEvent[]): [string, Slot[]][] {
  const slotMap = new Map<string, Slot>();
  for (const ev of events) {
    const key = `${ev.start}|${ev.end}`;
    const length: 25 | 50 = (ev.title ?? "").toLowerCase().includes("50m") ? 50 : 25;
    const existing = slotMap.get(key);
    if (existing) {
      if (!existing.lengths.includes(length)) existing.lengths.push(length);
    } else {
      slotMap.set(key, { start: ev.start, end: ev.end, lengths: [length] });
    }
  }

  const dayMap = new Map<string, Slot[]>();
  for (const slot of slotMap.values()) {
    slot.lengths.sort((a, b) => a - b);
    const dayKey = slot.start.slice(0, 10);
    const existing = dayMap.get(dayKey);
    if (existing) {
      existing.push(slot);
    } else {
      dayMap.set(dayKey, [slot]);
    }
  }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, slots]) => [dayKey, [...slots].sort((a, b) => a.start.localeCompare(b.start))]);
}
