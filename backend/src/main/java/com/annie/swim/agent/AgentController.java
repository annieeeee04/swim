package com.annie.swim.agent;

import com.annie.swim.model.User;
import com.annie.swim.service.AuthService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Chat endpoint for the Coach tab. POST /api/agent/chat streams the agent's
 * tool steps and final answer over Server-Sent Events. Feature-flagged:
 * returns 503 while {@code app.agent.enabled=false} so the rest of the app
 * is completely unaffected.
 */
@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private static final Logger log = LoggerFactory.getLogger(AgentController.class);
    private static final long SSE_TIMEOUT_MS = 120_000;

    private final AgentProperties props;
    private final AgentOrchestrator orchestrator;
    private final AuthService auth;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "agent-chat");
        t.setDaemon(true);
        return t;
    });

    public AgentController(AgentProperties props, AgentOrchestrator orchestrator, AuthService auth) {
        this.props = props;
        this.orchestrator = orchestrator;
        this.auth = auth;
    }

    public record ChatRequest(String message, Long conversationId) {
    }

    /** Lightweight probe so the frontend can hide/disable the Coach tab. */
    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("enabled", props.isEnabled());
    }

    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(@RequestHeader(value = "Authorization", required = false) String authHeader,
                           @RequestBody ChatRequest request) {
        if (!props.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The Coach agent is not enabled on this server.");
        }
        if (request == null || request.message() == null || request.message().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "message is required");
        }
        User user = auth.requireUser(authHeader);

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        executor.execute(() -> {
            try {
                Long conversationId = orchestrator.run(
                        user, request.conversationId(), request.message().trim(),
                        (type, payload) -> send(emitter, type, payload));
                send(emitter, "done", Map.of("conversationId", conversationId));
                emitter.complete();
            } catch (Guardrails.GuardrailViolation e) {
                send(emitter, "error", Map.of("message", e.getMessage()));
                emitter.complete();
            } catch (Exception e) {
                log.error("Agent turn failed", e);
                send(emitter, "error", Map.of("message",
                        e.getMessage() == null ? "The Coach hit an unexpected error." : e.getMessage()));
                emitter.complete();
            }
        });
        return emitter;
    }

    private void send(SseEmitter emitter, String type, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(type).data(mapper.writeValueAsString(payload)));
        } catch (IOException | IllegalStateException e) {
            // Client went away mid-stream; nothing useful to do.
            log.debug("SSE send failed ({} event): {}", type, e.getMessage());
        } catch (Exception e) {
            log.warn("Failed to serialize SSE payload: {}", e.getMessage());
        }
    }
}
