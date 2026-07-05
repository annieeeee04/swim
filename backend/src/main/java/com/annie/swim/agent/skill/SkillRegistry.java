package com.annie.swim.agent.skill;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Auto-discovers every {@link Skill} bean at startup and exposes the set as
 * Anthropic-style tool definitions. The LLM's "toolbox" grows automatically
 * whenever a new Skill bean is added — no orchestrator changes needed.
 */
@Component
public class SkillRegistry {

    private final Map<String, Skill> skills = new LinkedHashMap<>();

    public SkillRegistry(List<Skill> discovered) {
        for (Skill s : discovered) {
            if (skills.put(s.name(), s) != null) {
                throw new IllegalStateException("Duplicate skill name: " + s.name());
            }
        }
    }

    public Optional<Skill> byName(String name) {
        return Optional.ofNullable(skills.get(name));
    }

    /** Tool definitions in the shape the Anthropic Messages API expects. */
    public List<Map<String, Object>> toolDefinitions() {
        return skills.values().stream()
                .map(s -> Map.<String, Object>of(
                        "name", s.name(),
                        "description", s.description(),
                        "input_schema", s.parameterSchema()))
                .toList();
    }

    public int size() {
        return skills.size();
    }
}
