package com.annie.swim.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GuardrailsTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private Guardrails guardrails(int dailyLimit) {
        AgentProperties props = new AgentProperties();
        props.setDailyUserLimit(dailyLimit);
        return new Guardrails(props);
    }

    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "object",
            "properties", Map.of(
                    "poolLength", Map.of("type", "integer", "enum", List.of(25, 50)),
                    "after", Map.of("type", "string")),
            "required", List.of("after"));

    @Test
    void acceptsValidArgs() throws Exception {
        Guardrails g = guardrails(10);
        var args = mapper.readTree("{\"poolLength\":50,\"after\":\"18:00\"}");
        assertDoesNotThrow(() -> g.validateArgs("t", SCHEMA, args));
    }

    @Test
    void rejectsMissingRequiredField() throws Exception {
        Guardrails g = guardrails(10);
        var args = mapper.readTree("{\"poolLength\":50}");
        assertThrows(Guardrails.GuardrailViolation.class, () -> g.validateArgs("t", SCHEMA, args));
    }

    @Test
    void rejectsWrongType() throws Exception {
        Guardrails g = guardrails(10);
        var args = mapper.readTree("{\"poolLength\":\"fifty\",\"after\":\"18:00\"}");
        assertThrows(Guardrails.GuardrailViolation.class, () -> g.validateArgs("t", SCHEMA, args));
    }

    @Test
    void rejectsValueOutsideEnum() throws Exception {
        Guardrails g = guardrails(10);
        var args = mapper.readTree("{\"poolLength\":33,\"after\":\"18:00\"}");
        assertThrows(Guardrails.GuardrailViolation.class, () -> g.validateArgs("t", SCHEMA, args));
    }

    @Test
    void enforcesDailyTurnLimit() {
        Guardrails g = guardrails(2);
        g.checkAndCountTurn(1L);
        g.checkAndCountTurn(1L);
        assertThrows(Guardrails.GuardrailViolation.class, () -> g.checkAndCountTurn(1L));
        // Other users are unaffected.
        assertDoesNotThrow(() -> g.checkAndCountTurn(2L));
    }
}
