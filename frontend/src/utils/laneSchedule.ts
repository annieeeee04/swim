import type { SwimEvent } from "../types";
import type { LaneScheduleInfo } from "../components/Pool3D";

const LANE_REGEX = /lane\s*0*(\d+)/i;

/** Pull an explicit lane number out of a facility name like "Rec Lane 05" or
 *  "Comp 50M Lane 0". Returns null if there's no lane number, or if it's
 *  "Lane 0" — UBC seems to use that to mean "whole pool", not a real lane. */
export function parseLaneNumber(facilityName: string): number | null {
  const match = facilityName.match(LANE_REGEX);
  if (!match) return null;
  const lane = Number(match[1]);
  return lane > 0 ? lane : null;
}

export function isFiftyMeter(event: SwimEvent): boolean {
  return event.title.toLowerCase().includes("50m");
}

export interface LaneSchedule {
  /** lane number (1..lanesCount) -> sessions running in/across that lane, soonest first */
  byLane: Map<number, SwimEvent[]>;
  laneInfo: Record<number, LaneScheduleInfo>;
}

/**
 * Buckets events onto the pool's numbered lanes. Sessions whose facility
 * name names a specific lane go only there; sessions that just say
 * "Recreation Pool" / "Comp 50M Lane 0" (no real lane) are whole-pool
 * sessions, so they show up under every lane of the pool — they're not
 * lane-exclusive, but a swimmer dropping into any lane could swim them.
 */
export function buildLaneSchedule(events: SwimEvent[], lanesCount: number): LaneSchedule {
  const byLane = new Map<number, SwimEvent[]>();
  for (let lane = 1; lane <= lanesCount; lane++) byLane.set(lane, []);

  for (const ev of events) {
    const lane = parseLaneNumber(ev.facilityName);
    if (lane !== null && lane <= lanesCount) {
      byLane.get(lane)!.push(ev);
    } else {
      for (let l = 1; l <= lanesCount; l++) byLane.get(l)!.push(ev);
    }
  }

  const laneInfo: Record<number, LaneScheduleInfo> = {};
  for (const [lane, sessions] of byLane) {
    sessions.sort((a, b) => a.start.localeCompare(b.start));
    const has25 = sessions.some((ev) => !isFiftyMeter(ev));
    const has50 = sessions.some((ev) => isFiftyMeter(ev));
    laneInfo[lane] = { has25, has50, count: sessions.length };
  }

  return { byLane, laneInfo };
}
