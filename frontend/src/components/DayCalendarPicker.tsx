import { useEffect, useMemo, useRef, useState } from "react";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

interface DayCalendarPickerProps {
  /** Every day-key ("yyyy-MM-dd") that actually has sessions. */
  days: string[];
  activeDay: string | null;
  onSelectDay: (day: string) => void;
}

/**
 * A compact "📅 <date>" trigger that expands into a month-grid calendar,
 * replacing a long horizontally-scrolling row of day chips. Only days that
 * appear in `days` are selectable — everything else is shown but disabled.
 */
export default function DayCalendarPicker({ days, activeDay, onSelectDay }: DayCalendarPickerProps) {
  const daySet = useMemo(() => new Set(days), [days]);
  const todayKey = useMemo(() => {
    const now = new Date();
    return toDayKey(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [open, setOpen] = useState(false);

  // The user can navigate away from the active day's month with the ‹ › nav
  // buttons; `navMonth` holds that override. Whenever `activeDay` changes
  // (e.g. the schedule loads a different default day), the override resets
  // so the calendar snaps back to following the active day — done as a
  // render-time state adjustment rather than an effect, per React's
  // guidance on resetting state when a prop changes.
  const [navMonth, setNavMonth] = useState<{ y: number; m: number } | null>(null);
  const [lastActiveDay, setLastActiveDay] = useState(activeDay);
  if (activeDay !== lastActiveDay) {
    setLastActiveDay(activeDay);
    setNavMonth(null);
  }

  const base = activeDay ?? days[0] ?? todayKey;
  const viewYear = navMonth?.y ?? Number(base.slice(0, 4));
  const viewMonth = navMonth?.m ?? Number(base.slice(5, 7)) - 1;

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: { key: string | null; day: number | null }[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push({ key: null, day: null });
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({ key: toDayKey(viewYear, viewMonth, day), day });
    }
    return out;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setNavMonth({ y, m });
  };

  const triggerLabel = activeDay
    ? new Date(Number(activeDay.slice(0, 4)), Number(activeDay.slice(5, 7)) - 1, Number(activeDay.slice(8, 10))).toLocaleDateString(
        "en-US",
        { weekday: "short", month: "short", day: "numeric" },
      )
    : "Pick a day";

  return (
    <div className="day-calendar" ref={containerRef}>
      <button
        type="button"
        className="day-calendar-trigger glass-surface"
        data-glass
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="day-calendar-trigger-icon">📅</span>
        {triggerLabel}
        <span className={`day-calendar-chevron ${open ? "is-open" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="day-calendar-panel glass-surface" data-glass>
          <div className="day-calendar-nav">
            <button type="button" className="day-calendar-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <span className="day-calendar-month">{monthLabel}</span>
            <button type="button" className="day-calendar-nav-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>

          <div className="day-calendar-weekdays">
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>

          <div className="day-calendar-grid">
            {cells.map((cell, i) => {
              if (cell.key === null) return <span key={i} className="day-calendar-cell is-empty" />;
              const hasSessions = daySet.has(cell.key);
              const isActive = cell.key === activeDay;
              const isToday = cell.key === todayKey;
              return (
                <button
                  type="button"
                  key={cell.key}
                  className={`day-calendar-cell ${hasSessions ? "has-sessions" : "is-disabled"} ${isActive ? "is-active" : ""} ${isToday ? "is-today" : ""}`}
                  disabled={!hasSessions}
                  onClick={() => {
                    onSelectDay(cell.key!);
                    setOpen(false);
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
