package com.annie.swim.agent.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Audit log: one tool call the agent made — its arguments, result summary and
 * latency. Doubles as the observability layer: any non-deterministic decision
 * the agent took can be replayed from these rows.
 */
@Entity
@Table(name = "agent_steps")
public class AgentStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long conversationId;

    @Column(nullable = false)
    private int stepIndex;

    @Column(nullable = false)
    private String toolName;

    @Lob
    @Column
    private String argsJson;

    @Lob
    @Column
    private String resultSummary;

    @Column
    private long latencyMs;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public AgentStep() {
    }

    public AgentStep(Long conversationId, int stepIndex, String toolName,
                     String argsJson, String resultSummary, long latencyMs) {
        this.conversationId = conversationId;
        this.stepIndex = stepIndex;
        this.toolName = toolName;
        this.argsJson = argsJson;
        this.resultSummary = resultSummary;
        this.latencyMs = latencyMs;
    }

    public Long getId() {
        return id;
    }

    public Long getConversationId() {
        return conversationId;
    }

    public int getStepIndex() {
        return stepIndex;
    }

    public String getToolName() {
        return toolName;
    }

    public String getArgsJson() {
        return argsJson;
    }

    public String getResultSummary() {
        return resultSummary;
    }

    public long getLatencyMs() {
        return latencyMs;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
