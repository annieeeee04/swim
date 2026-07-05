package com.annie.swim.agent.llm;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

/**
 * Normalized model output for one turn.
 *
 * @param text       concatenated text blocks (may be empty)
 * @param toolCalls  tool invocations requested by the model (empty = final answer)
 * @param stopReason provider stop reason, e.g. "end_turn" or "tool_use"
 * @param rawContent provider-shaped content blocks, echoed back verbatim as the
 *                   assistant message on the next loop iteration
 */
public record LlmResponse(
        String text,
        List<ToolCall> toolCalls,
        String stopReason,
        List<Map<String, Object>> rawContent) {

    /** One tool_use block: the model wants a skill executed. */
    public record ToolCall(String id, String name, JsonNode input) {
    }
}
