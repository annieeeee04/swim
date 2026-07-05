package com.annie.swim.agent;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Configuration for the agentic "Swim Coach" layer (see docs/AGENT_ARCHITECTURE.md).
 * The whole feature is behind {@code app.agent.enabled} so the app still builds,
 * runs, and deploys with the agent turned off and no LLM key configured.
 */
@Component
@ConfigurationProperties(prefix = "app.agent")
public class AgentProperties {

    /** Master feature flag. When false, /api/agent/** returns 503. */
    private boolean enabled = false;

    /** Hard cap on orchestrator loop iterations (tool rounds) per user turn. */
    private int maxSteps = 6;

    /** Max agent turns per user per day (cheap in-memory rate limit). */
    private int dailyUserLimit = 50;

    /** Anthropic model id used by the Claude LlmClient implementation. */
    private String model = "claude-sonnet-4-5";

    /** Anthropic API key. Blank = LLM calls fail fast with a clear error. */
    private String anthropicApiKey = "";

    /** Max tokens per model response. */
    private int maxTokens = 1024;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getMaxSteps() {
        return maxSteps;
    }

    public void setMaxSteps(int maxSteps) {
        this.maxSteps = maxSteps;
    }

    public int getDailyUserLimit() {
        return dailyUserLimit;
    }

    public void setDailyUserLimit(int dailyUserLimit) {
        this.dailyUserLimit = dailyUserLimit;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getAnthropicApiKey() {
        return anthropicApiKey;
    }

    public void setAnthropicApiKey(String anthropicApiKey) {
        this.anthropicApiKey = anthropicApiKey;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = maxTokens;
    }
}
