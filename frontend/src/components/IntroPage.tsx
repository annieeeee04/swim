import { useEffect, useState } from "react";
import SwimSchool from "./SwimSchool";

/**
 * Landing/intro screen shown before the main Schedule/Pool/Records app.
 * Gives a first-time visitor a quick sense of what this is and why they'd
 * use it, then hands off to the main app via onStart(). Purely presentational
 * — no data fetching here, so it can render instantly while the schedule
 * loads in the background behind it.
 */
export default function IntroPage({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger the entrance transition on the next frame after mount.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleStart() {
    setLeaving(true);
    // Let the exit transition play before unmounting into the main app.
    setTimeout(onStart, 480);
  }

  return (
    <div className={`intro ${mounted ? "is-mounted" : ""} ${leaving ? "is-leaving" : ""}`}>
      <div className="intro-bg" aria-hidden="true">
        <div className="intro-bg-blob intro-bg-blob-1" />
        <div className="intro-bg-blob intro-bg-blob-2" />
        <div className="intro-bg-ripples">
          <span />
          <span />
          <span />
        </div>
        <SwimSchool count={6} seed={5} className="intro-school" />
      </div>

      <div className="intro-content">
        <span className="intro-kicker">UBC AQUATIC CENTRE</span>

        <h1 className="intro-title">
          <span className="intro-title-line">Find your lane.</span>
          <span className="intro-title-line intro-title-line-accent">Log your swim.</span>
        </h1>

        <p className="intro-desc">
          A live feed of UBC's drop-in <strong>Length Swim</strong> sessions, paired with a
          playful 3D pool where you pick a lane, race as Woody, Buzz, or Bo&nbsp;Peep, and
          track every length you've ever swum.
        </p>

        <div className="intro-cards">
          <div className="intro-card glass-surface" data-glass>
            <span className="intro-card-icon" aria-hidden="true">
              🗓️
            </span>
            <h3>Schedule</h3>
            <p>Real UBC pm-feed data, filtered to 25m/50m Length Swim only — refreshed live.</p>
          </div>
          <div className="intro-card glass-surface" data-glass>
            <span className="intro-card-icon" aria-hidden="true">
              🏊
            </span>
            <h3>3D Pool</h3>
            <p>See which lanes are running 25m or 50m sessions, then claim an open one.</p>
          </div>
          <div className="intro-card glass-surface" data-glass>
            <span className="intro-card-icon" aria-hidden="true">
              🏆
            </span>
            <h3>My Records</h3>
            <p>Every swim you log is saved — distance, lane, and pool length, all time.</p>
          </div>
        </div>

        <button className="intro-start-btn" onClick={handleStart}>
          <span>Start swimming</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 6l6 6-6 6"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
