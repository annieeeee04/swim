/**
 * Real-time push channel to the backend (see PushService.java).
 *
 * One WebSocket per signed-in session: connect with the bearer token sent as
 * the FIRST frame ({"token": …} — keeps it out of URLs/access logs), then the
 * server pushes events:
 *
 *   { type: "notification", data: AppNotification }  new bell notification
 *   { type: "message",      data: ChatMessage }      new DM addressed to you
 *   { type: "social" }                               friends/requests/invites changed
 *   { type: "presence",     data: {userId, inPool, lane, poolLength} }
 *
 * Components subscribe with onRealtimeEvent(). Delivery is best-effort — the
 * UI keeps slow polling fallbacks, so a dropped socket only means "slightly
 * less instant", never "broken". Reconnects automatically with backoff.
 */

export interface RealtimeEvent {
  type: "ready" | "notification" | "message" | "social" | "presence";
  data?: unknown;
}

type Listener = (event: RealtimeEvent) => void;

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let currentToken: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1_000;

function wsUrl(): string {
  return API_BASE.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";
}

function scheduleReconnect(): void {
  if (!currentToken || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    openSocket();
  }, reconnectDelay);
}

function openSocket(): void {
  if (!currentToken) return;
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    socket?.send(JSON.stringify({ token: currentToken }));
  };

  socket.onmessage = (raw) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw.data as string);
    } catch {
      return;
    }
    if (event.type === "ready") {
      reconnectDelay = 1_000; // authenticated — reset the backoff
    }
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* one bad listener shouldn't break the rest */
      }
    }
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

/** Opens (or re-keys) the realtime connection for the signed-in user. */
export function connectRealtime(token: string): void {
  if (currentToken === token && socket) return;
  disconnectRealtime();
  currentToken = token;
  openSocket();
}

/** Tears the connection down (logout). */
export function disconnectRealtime(): void {
  currentToken = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = 1_000;
  if (socket) {
    const s = socket;
    socket = null;
    s.onclose = null;
    s.close();
  }
}

/** Subscribes to pushed events; returns an unsubscribe function. */
export function onRealtimeEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
