package com.annie.swim.agent.skill;

/**
 * Result of one skill execution.
 *
 * @param summary short human-readable outcome, streamed to the client
 *                ("found 3 open 50m slots") and stored in the audit log
 * @param data    structured payload serialized to JSON and returned to the
 *                model as the tool result (and to the client for cards)
 */
public record SkillResult(String summary, Object data) {

    public static SkillResult of(String summary, Object data) {
        return new SkillResult(summary, data);
    }
}
