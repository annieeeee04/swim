/** "2026-06-21 07:30:00" -> treat as a wall-clock time, just format hh:mm AM/PM. */
export function formatTime(localDateTime: string): string {
  const [, time] = localDateTime.split(" ");
  const [hh, mm] = time.split(":").map(Number);
  const period = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${mm.toString().padStart(2, "0")} ${period}`;
}

/** "2026-06-21" -> "Sunday, June 21" */
export function formatDayHeading(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
