package com.annie.swim.agent;

import com.annie.swim.agent.llm.LlmClient;
import com.annie.swim.agent.llm.LlmResponse;
import com.annie.swim.agent.model.AgentStep;
import com.annie.swim.agent.model.Conversation;
import com.annie.swim.agent.model.ConversationMessage;
import com.annie.swim.agent.repository.AgentStepRepository;
import com.annie.swim.agent.repository.ConversationMessageRepository;
import com.annie.swim.agent.repository.ConversationRepository;
import com.annie.swim.agent.skill.Skill;
import com.annie.swim.agent.skill.SkillContext;
import com.annie.swim.agent.skill.SkillRegistry;
import com.annie.swim.agent.skill.SkillResult;
import com.annie.swim.model.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The perceive → reason → act → observe loop. Runs server-side; partial
 * output (tool steps, final text) is pushed to the caller through
 * {@link AgentEventListener} so the controller can stream it over SSE.
 *
 * The agent has no powers of its own: every action is a {@link Skill} that
 * wraps an existing domain service, every call is validated and budgeted by
 * {@link Guardrails}, and every step is persisted to {@code agent_steps}.
 */
@Service
public class AgentOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AgentOrchestrator.class);
    private static final ZoneId VANCOUVER = ZoneId.of("America/Vancouver");

    /** Receives streamable events: "step" (tool executed), "message" (final text). */
    public interface AgentEventListener {
        void onEvent(String type, Object payload);
    }

    private final LlmClient llm;
    private final SkillRegistry skills;
    private final Guardrails guardrails;
    private final ConversationRepository conversations;
    private final ConversationMessageRepository messages;
    private final AgentStepRepository steps;
    private final ObjectMapper mapper = new ObjectMapper();

    public AgentOrchestrator(LlmClient llm,
                             SkillRegistry skills,
                             Guardrails guardrails,
                             ConversationRepository conversations,
                             ConversationMessageRepository messages,
                             AgentStepRepository steps) {
        this.llm = llm;
        this.skills = skills;
        this.guardrails = guardrails;
        this.conversations = conversations;
        this.messages = messages;
        this.steps = steps;
    }

    /**
     * Runs one full user turn. Returns the conversation id (created if needed).
     * Throws {@link Guardrails.GuardrailViolation} or RuntimeException on failure;
     * the controller converts those into SSE error events.
     */
    public Long run(User user, Long conversationId, String userMessage, AgentEventListener listener) {
        guardrails.checkAndCountTurn(user.getId());

        Conversation conversation = resolveConversation(user, conversationId, userMessage);
        messages.save(new ConversationMessage(conversation.getId(), "user", userMessage));

        // PERCEIVE — prior turns + fresh user context go into the model prompt.
        List<Map<String, Object>> turns = new ArrayList<>(history(conversation.getId()));
        turns.add(Map.of("role", "user", "content", userMessage));

        String system = systemPrompt(user);
        List<Map<String, Object>> tools = skills.toolDefinitions();

        for (int step = 1; step <= guardrails.maxSteps(); step++) {
            // REASON
            LlmResponse response = llm.complete(system, turns, tools);

            if (response.toolCalls().isEmpty()) {
                // Final answer — persist, stream, done.
                messages.save(new ConversationMessage(conversation.getId(), "assistant", response.text()));
                listener.onEvent("message", Map.of("text", response.text()));
                return conversation.getId();
            }

            // Echo the assistant's tool_use turn back into the transcript.
            turns.add(Map.of("role", "assistant", "content", response.rawContent()));

            // ACT + OBSERVE — execute each requested tool, feed results back.
            List<Map<String, Object>> toolResults = new ArrayList<>();
            for (LlmResponse.ToolCall call : response.toolCalls()) {
                toolResults.add(executeTool(conversation.getId(), step, user, call, listener));
            }
            turns.add(Map.of("role", "user", "content", toolResults));
        }

        // Step budget exhausted without a final answer.
        String fallback = "I ran out of steps before finishing — try asking a more specific question.";
        messages.save(new ConversationMessage(conversation.getId(), "assistant", fallback));
        listener.onEvent("message", Map.of("text", fallback));
        return conversation.getId();
    }

    /** Validates, runs, audits and streams one tool call; returns the tool_result block. */
    private Map<String, Object> executeTool(Long conversationId, int stepIndex, User user,
                                            LlmResponse.ToolCall call, AgentEventListener listener) {
        Skill skill = skills.byName(call.name()).orElse(null);
        String resultJson;
        String summary;

        long started = System.currentTimeMillis();
        if (skill == null) {
            summary = "Unknown tool: " + call.name();
            resultJson = errorJson(summary);
        } else {
            try {
                guardrails.validateArgs(skill.name(), skill.parameterSchema(), call.input());
                SkillResult result = skill.execute(new SkillContext(user), call.input());
                summary = result.summary();
                resultJson = mapper.writeValueAsString(
                        Map.of("summary", result.summary(), "data", result.data()));
            } catch (Guardrails.GuardrailViolation e) {
                summary = e.getMessage();
                resultJson = errorJson(summary);
            } catch (Exception e) {
                log.warn("Skill {} failed: {}", call.name(), e.getMessage());
                summary = "Tool failed: " + e.getMessage();
                resultJson = errorJson(summary);
            }
        }
        long latency = System.currentTimeMillis() - started;

        // Audit log — every decision is replayable.
        steps.save(new AgentStep(conversationId, stepIndex, call.name(),
                call.input() == null ? null : call.input().toString(), summary, latency));

        // Stream the observation to the client as it happens.
        listener.onEvent("step", Map.of(
                "tool", call.name(),
                "summary", summary,
                "latencyMs", latency));

        return Map.of(
                "type", "tool_result",
                "tool_use_id", call.id(),
                "content", resultJson);
    }

    private Conversation resolveConversation(User user, Long conversationId, String userMessage) {
        if (conversationId != null) {
            Conversation existing = conversations.findById(conversationId).orElse(null);
            if (existing != null && existing.getUserId().equals(user.getId())) {
                return existing;
            }
        }
        String title = userMessage.length() > 60 ? userMessage.substring(0, 60) + "…" : userMessage;
        return conversations.save(new Conversation(user.getId(), title));
    }

    /** Prior plain-text turns (tool traffic is not persisted as messages). */
    private List<Map<String, Object>> history(Long conversationId) {
        return messages.findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                .map(m -> Map.<String, Object>of("role", m.getRole(), "content", m.getContent()))
                .toList();
    }

    private String systemPrompt(User user) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are Swim Coach, the assistant inside the UBC Length Swim app. ")
          .append("You help swimmers find UBC Aquatic Centre Length Swim sessions, understand their ")
          .append("training progress, and plan swims. Use the provided tools for any factual claim ")
          .append("about the schedule or the user's history — never invent sessions or statistics.\n\n")
          .append("Rules:\n")
          .append("- General fitness guidance only. You are not a medical professional; for pain, ")
          .append("injury or health conditions, tell the user to consult one.\n")
          .append("- Be concise and friendly. Prefer specific times, dates and meters over vague advice.\n")
          .append("- If a tool returns no results, say so honestly and suggest alternatives.\n\n")
          .append("Today is ").append(LocalDate.now(VANCOUVER)).append(" (America/Vancouver).\n")
          .append("User: ").append(user.getDisplayName());
        if (user.getAge() != null) {
            sb.append(", age ").append(user.getAge());
            if (user.getAge() < 18) {
                sb.append(" (a minor — keep advice age-appropriate and conservative)");
            }
        }
        sb.append('.');
        return sb.toString();
    }

    private String errorJson(String message) {
        try {
            return mapper.writeValueAsString(Map.of("error", message));
        } catch (Exception e) {
            return "{\"error\":\"internal\"}";
        }
    }
}
