package com.annie.swim.agent;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Safety wrapper around every orchestrator iteration:
 * step budget, per-user daily rate limit, and tool-argument validation
 * against the skill's declared JSON schema — all before any skill runs.
 */
@Component
public class Guardrails {

    private final AgentProperties props;

    /** userId -> (day, turns used). Reset lazily when the day rolls over. */
    private final Map<Long, DayCount> usage = new ConcurrentHashMap<>();

    public Guardrails(AgentProperties props) {
        this.props = props;
    }

    // ---------- budgets ----------

    public int maxSteps() {
        return props.getMaxSteps();
    }

    /** Counts one chat turn against the user's daily allowance. */
    public void checkAndCountTurn(Long userId) {
        LocalDate today = LocalDate.now();
        DayCount count = usage.compute(userId, (k, v) ->
                v == null || !v.day.equals(today) ? new DayCount(today) : v);
        if (count.turns.incrementAndGet() > props.getDailyUserLimit()) {
            throw new GuardrailViolation(
                    "Daily Coach limit reached (" + props.getDailyUserLimit() + " turns). Try again tomorrow.");
        }
    }

    // ---------- argument validation ----------

    /**
     * Validates model-provided tool args against the skill's schema:
     * args must be an object, all required fields present, and every known
     * property must match its declared primitive type / enum.
     */
    @SuppressWarnings("unchecked")
    public void validateArgs(String toolName, Map<String, Object> schema, JsonNode args) {
        if (args == null || !args.isObject()) {
            throw new GuardrailViolation("Tool " + toolName + ": arguments must be a JSON object.");
        }
        Object requiredObj = schema.get("required");
        if (requiredObj instanceof List<?> required) {
            for (Object field : required) {
                if (!args.hasNonNull(String.valueOf(field))) {
                    throw new GuardrailViolation(
                            "Tool " + toolName + ": missing required argument \"" + field + "\".");
                }
            }
        }
        Object propsObj = schema.get("properties");
        if (!(propsObj instanceof Map)) {
            return;
        }
        Map<String, Object> properties = (Map<String, Object>) propsObj;
        args.fieldNames().forEachRemaining(field -> {
            Object specObj = properties.get(field);
            if (!(specObj instanceof Map)) {
                return; // unknown fields are tolerated (models add extras)
            }
            Map<String, Object> spec = (Map<String, Object>) specObj;
            JsonNode value = args.get(field);
            if (value.isNull()) {
                return;
            }
            String type = String.valueOf(spec.get("type"));
            boolean ok = switch (type) {
                case "string" -> value.isTextual();
                case "integer" -> value.isIntegralNumber();
                case "number" -> value.isNumber();
                case "boolean" -> value.isBoolean();
                case "array" -> value.isArray();
                case "object" -> value.isObject();
                default -> true;
            };
            if (!ok) {
                throw new GuardrailViolation(
                        "Tool " + toolName + ": argument \"" + field + "\" must be of type " + type + ".");
            }
            Object enumObj = spec.get("enum");
            if (enumObj instanceof List<?> allowed) {
                Object actual = value.isIntegralNumber() ? value.asInt()
                        : value.isNumber() ? value.asDouble()
                        : value.isTextual() ? value.asText()
                        : null;
                if (actual != null && allowed.stream().noneMatch(a -> a.equals(actual))) {
                    throw new GuardrailViolation(
                            "Tool " + toolName + ": argument \"" + field + "\" must be one of " + allowed + ".");
                }
            }
        });
    }

    /** Thrown when a guardrail blocks an action; surfaced to the client as an error event. */
    public static class GuardrailViolation extends RuntimeException {
        public GuardrailViolation(String message) {
            super(message);
        }
    }

    private static final class DayCount {
        final LocalDate day;
        final AtomicInteger turns = new AtomicInteger();

        DayCount(LocalDate day) {
            this.day = day;
        }
    }
}
