import type { SwimEvent } from "../types";
import { formatTime } from "../utils/time";

function poolEmoji(facilityName: string): string {
  const name = facilityName.toLowerCase();
  if (name.includes("recreation")) return "🔵";
  if (name.includes("leisure")) return "🟢";
  if (name.includes("competition") || name.includes("comp")) return "🟣";
  return "📍";
}

export default function SessionRow({ event }: { event: SwimEvent }) {
  const isFifty = event.title.toLowerCase().includes("50m");
  const isCommunityNight = event.title.toLowerCase().includes("community night");

  return (
    <li className="session">
      <span className="session-emoji" aria-hidden="true">
        {isFifty ? "🏊‍♀️" : "🏊"}
      </span>
      <div className="session-main">
        <span className="session-time">
          {formatTime(event.start)}–{formatTime(event.end)}
        </span>
        <span className="session-pool">
          {poolEmoji(event.facilityName)} {event.facilityName}
        </span>
        {isCommunityNight && <span className="session-tag-night">$3 Community Night</span>}
      </div>
      <span className="session-length">{isFifty ? "50m" : "25m"}</span>
      {event.curl && (
        <a className="session-book" href={event.curl} target="_blank" rel="noopener noreferrer">
          Details
        </a>
      )}
    </li>
  );
}
