package com.annie.swim.agent.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

/** One user or assistant turn inside a {@link Conversation}. */
@Entity
@Table(name = "agent_conversation_messages")
public class ConversationMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long conversationId;

    /** "user" or "assistant". */
    @Column(nullable = false)
    private String role;

    @Lob
    @Column(nullable = false)
    private String content;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public ConversationMessage() {
    }

    public ConversationMessage(Long conversationId, String role, String content) {
        this.conversationId = conversationId;
        this.role = role;
        this.content = content;
    }

    public Long getId() {
        return id;
    }

    public Long getConversationId() {
        return conversationId;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
