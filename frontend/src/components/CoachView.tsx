import { useEffect, useRef, useState } from "react";
import { fetchCoachStatus, streamCoachChat } from "../api";
import type { CoachStep } from "../api";
import "./CoachView.css";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Tool steps the agent streamed while producing this answer. */
  steps: CoachStep[];
  error?: boolean;
}

const SUGGESTIONS = [
  "Find me a 50m lane after 6pm this week",
  "How is my swim volume trending?",
  "What's the next 25m Length Swim session?",
  "How long is my current streak?",
];

/**
 * The Coach tab: a chat panel over POST /api/agent/chat (SSE). Tool steps
 * stream in as they happen ("found 3 slots…"), then the final answer lands.
 */
export default function CoachView() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCoachStatus().then((on) => {
      if (!cancelled) setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: message, steps: [] },
      { role: "assistant", text: "", steps: [] },
    ]);

    const patchLast = (patch: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) =>
        prev.map((m, i) => (i === prev.length - 1 ? patch(m) : m)),
      );

    try {
      await streamCoachChat(message, conversationId, {
        onStep: (step) => patchLast((m) => ({ ...m, steps: [...m.steps, step] })),
        onMessage: (answer) => patchLast((m) => ({ ...m, text: answer })),
        onError: (err) => patchLast((m) => ({ ...m, text: err, error: true })),
        onDone: (id) => {
          if (id != null) setConversationId(id);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The Coach couldn't answer right now.";
      patchLast((m) => ({ ...m, text: msg, error: true }));
    } finally {
      setBusy(false);
    }
  };

  if (enabled === null) {
    return <p className="empty-state">Checking whether the Coach is on duty…</p>;
  }

  if (!enabled) {
    return (
      <div className="coach-disabled glass-surface" data-glass>
        <span className="coach-disabled-emoji">🛟</span>
        <h2>The Coach is off duty</h2>
        <p>
          The Swim Coach agent isn't enabled on this server. An admin can turn it on with
          <code> app.agent.enabled=true</code> (plus an Anthropic API key) in the backend
          configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="coach glass-surface" data-glass>
      <div className="coach-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="coach-welcome">
            <span className="coach-welcome-emoji">🏊‍♀️</span>
            <h2>Ask your Swim Coach</h2>
            <p>Schedules, progress, streaks — just ask.</p>
            <div className="coach-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip glass-surface" data-glass onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`coach-msg coach-msg-${m.role}`}>
            {m.steps.length > 0 && (
              <ul className="coach-steps">
                {m.steps.map((s, j) => (
                  <li key={j}>
                    <span className="coach-step-tool">{prettyTool(s.tool)}</span> {s.summary}
                  </li>
                ))}
              </ul>
            )}
            {m.text ? (
              <div className={`coach-bubble ${m.error ? "coach-bubble-error" : ""}`}>{m.text}</div>
            ) : (
              m.role === "assistant" && busy && i === messages.length - 1 && (
                <div className="coach-bubble coach-thinking">
                  <span />
                  <span />
                  <span />
                </div>
              )
            )}
          </div>
        ))}
      </div>

      <form
        className="coach-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="coach-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the Coach anything about your swimming…"
          disabled={busy}
        />
        <button className="coach-send" type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function prettyTool(tool: string): string {
  switch (tool) {
    case "schedule_find_sessions":
      return "📅 Schedule";
    case "progress_summary":
      return "📈 Progress";
    default:
      return `🔧 ${tool}`;
  }
}
