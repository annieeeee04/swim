package com.annie.swim.service;

import com.annie.swim.model.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * Real-time push channel. Clients open a WebSocket to {@code /ws} and send
 * {@code {"token": "<bearer token>"}} as their FIRST frame (first-message
 * auth keeps the token out of URLs and access logs). Once authenticated, the
 * session is registered against the user id and the server can push events:
 *
 * <pre>{"type": "notification" | "message" | "social" | "presence", "data": …}</pre>
 *
 * - {@code notification}: a new in-app notification (data = the Notification)
 * - {@code message}: a new DM addressed to you (data = the DirectMessage)
 * - {@code social}: your friend graph / requests / invites changed — refetch
 * - {@code presence}: a friend entered or left the pool (data = who/lane/pool)
 *
 * REST stays the source of truth; pushes just tell clients *when* to look,
 * plus carry enough data for instant chat/notification updates. Delivery is
 * best-effort — the frontend keeps a slow polling fallback for missed events.
 */
@Service
public class PushService extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);
    /** Cap queued outbound bytes per session so one dead client can't pile up memory. */
    private static final int SEND_BUFFER_LIMIT = 512 * 1024;
    private static final int SEND_TIME_LIMIT_MS = 5_000;

    private final AuthService auth;
    /** Spring's auto-configured mapper — it knows how to serialize Instant etc. */
    private final ObjectMapper json;

    /** Authenticated sessions per user (a user may have several tabs open). */
    private final Map<Long, Set<WebSocketSession>> sessionsByUser = new ConcurrentHashMap<>();
    /** Reverse index for cleanup on close. */
    private final Map<String, Long> userBySessionId = new ConcurrentHashMap<>();
    /** Decorated (thread-safe) session wrappers, keyed by raw session id. */
    private final Map<String, WebSocketSession> decorated = new ConcurrentHashMap<>();

    public PushService(AuthService auth, ObjectMapper json) {
        this.auth = auth;
        this.json = json;
    }

    // ---------- push API used by controllers/services ----------

    public void sendToUser(Long userId, String type, Object data) {
        if (userId == null) {
            return;
        }
        Set<WebSocketSession> sessions = sessionsByUser.get(userId);
        if (sessions == null || sessions.isEmpty()) {
            return;
        }
        TextMessage frame = frame(type, data);
        if (frame == null) {
            return;
        }
        for (WebSocketSession session : sessions) {
            try {
                session.sendMessage(frame);
            } catch (Exception e) {
                log.debug("push to user {} failed, dropping session {}", userId, session.getId());
                cleanup(session);
            }
        }
    }

    public void sendToUsers(Collection<Long> userIds, String type, Object data) {
        for (Long id : userIds) {
            sendToUser(id, type, data);
        }
    }

    // ---------- WebSocket lifecycle ----------

    @Override
    protected void handleTextMessage(WebSocketSession rawSession, TextMessage message) {
        if (userBySessionId.containsKey(rawSession.getId())) {
            return; // already authenticated; inbound frames are ignored (push-only channel)
        }
        Long userId = authenticate(message.getPayload());
        if (userId == null) {
            close(rawSession, CloseStatus.POLICY_VIOLATION.withReason("invalid token"));
            return;
        }
        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(
                rawSession, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT);
        decorated.put(rawSession.getId(), session);
        userBySessionId.put(rawSession.getId(), userId);
        sessionsByUser.computeIfAbsent(userId, k -> new CopyOnWriteArraySet<>()).add(session);
        try {
            session.sendMessage(frame("ready", null));
        } catch (Exception e) {
            cleanup(rawSession);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        cleanup(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        cleanup(session);
    }

    // ---------- internals ----------

    private Long authenticate(String payload) {
        try {
            JsonNode node = json.readTree(payload);
            String token = node.path("token").asText(null);
            if (token == null || token.isBlank()) {
                return null;
            }
            User user = auth.optionalUser(token);
            return user == null ? null : user.getId();
        } catch (Exception e) {
            return null;
        }
    }

    private TextMessage frame(String type, Object data) {
        try {
            return new TextMessage(json.writeValueAsString(Map.of(
                    "type", type,
                    "data", data == null ? Map.of() : data)));
        } catch (Exception e) {
            log.warn("could not serialize push event of type {}", type, e);
            return null;
        }
    }

    private void cleanup(WebSocketSession session) {
        String id = session.getId();
        WebSocketSession wrapped = decorated.remove(id);
        Long userId = userBySessionId.remove(id);
        if (userId != null) {
            Set<WebSocketSession> sessions = sessionsByUser.get(userId);
            if (sessions != null) {
                sessions.remove(wrapped != null ? wrapped : session);
                if (sessions.isEmpty()) {
                    sessionsByUser.remove(userId, sessions);
                }
            }
        }
        close(session, CloseStatus.NORMAL);
    }

    private void close(WebSocketSession session, CloseStatus status) {
        try {
            if (session.isOpen()) {
                session.close(status);
            }
        } catch (Exception ignored) {
            // already gone
        }
    }
}
