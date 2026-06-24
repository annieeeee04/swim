export interface SwimEvent {
  eventId: string;
  title: string;
  serviceName: string;
  facilityName: string;
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
