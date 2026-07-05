package com.annie.swim.agent.skill;

import com.annie.swim.model.User;

/** Per-turn context handed to every skill execution. */
public record SkillContext(User user) {
}
