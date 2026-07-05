package com.annie.swim.agent.skill;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

/**
 * A drop-in agent capability. Each Skill is a thin wrapper over an existing
 * domain service (schedule feed, swim records, leaderboard, ...) — the agent
 * gets no new powers, it only orchestrates what the app can already do.
 *
 * Every Skill bean is auto-discovered by {@link SkillRegistry} and its
 * metadata is exposed to the LLM as a tool definition. Adding a capability
 * = adding one class; the orchestrator never changes.
 */
public interface Skill {

    /** Tool name shown to the model, e.g. "schedule_find_sessions". */
    String name();

    /** Human/model-readable description used for tool selection. */
    String description();

    /**
     * JSON-Schema-shaped parameter description:
     * {@code {type: "object", properties: {...}, required: [...]}}.
     * Validated by Guardrails before {@link #execute} is called.
     */
    Map<String, Object> parameterSchema();

    /** Runs the skill with already-validated arguments. */
    SkillResult execute(SkillContext ctx, JsonNode args) throws Exception;
}
