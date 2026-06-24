import { useMemo } from "react";
import type { PoolFilter, SwimEvent } from "../types";
import SessionRow from "./SessionRow";

function formatDayHeading(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function ScheduleView({
  events,
  filter,
}: {
  events: SwimEvent[];
  filter: PoolFilter;
}) {
  const groupedByDay = useMemo(() => {
    const filtered = events.filter((ev) => {
      const isFifty = ev.title.toLowerCase().includes("50m");
      if (filter === "25m") return !isFifty;
      if (filter === "50m") return isFifty;
      return true;
    });

    const groups = new Map<string, SwimEvent[]>();
    for (const ev of filtered) {
      const dayKey = ev.start.slice(0, 10);
      const existing = groups.get(dayKey);
      if (existing) {
        existing.push(ev);
      } else {
        groups.set(dayKey, [ev]);
      }
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayKey, dayEvents]) => [
        dayKey,
        [...dayEvents].sort((a, b) => a.start.localeCompare(b.start)),
      ] as const);
  }, [events, filter]);

  if (groupedByDay.length === 0) {
    return <p className="empty-state">No sessions match this filter.</p>;
  }

  return (
    <div className="schedule">
      {groupedByDay.map(([dayKey, dayEvents]) => (
        <section key={dayKey} className="day-group">
          <h2 className="day-heading">{formatDayHeading(dayKey)}</h2>
          <ul className="session-list">
            {dayEvents.map((ev) => (
              <SessionRow key={ev.eventId} event={ev} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
