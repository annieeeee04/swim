package com.annie.swim.agent.llm;

import java.util.List;
import java.util.Map;

/**
 * Model-agnostic LLM abstraction. The orchestrator only depends on this
 * interface; the concrete provider (Claude today) is swappable via Spring
 * wiring / application.properties without touching the agent loop.
 */
public interface LlmClient {

    /**
     * One model turn.
     *
     * @param system   system prompt
     * @param messages conversation so far, Anthropic Messages API shape:
     *                 {@code [{role: "user"|"assistant", content: ...}, ...]}
     * @param tools    tool definitions the model may call (may be empty)
     */
    LlmResponse complete(String system, List<Map<String, Object>> messages, List<Map<String, Object>> tools);
}
