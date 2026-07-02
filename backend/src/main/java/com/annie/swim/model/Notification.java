package com.annie.swim.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A lightweight in-app notification for one user (friend request received,
 * request accepted, new message, swim invite, invite accepted/declined…).
 * The frontend polls these and shows them under the header bell.
 */
@Entity
@Table(name = "notifications")
public class Notification {

    public enum Type {
        FRIEND_REQUEST, FRIEND_ACCEPTED, MESSAGE, INVITE, INVITE_ACCEPTED, INVITE_DECLINED, FRIEND_IN_POOL
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String type;

    @Column(nullable = false, length = 500)
    private String text;

    /** Optional id of the related row (invite id, friendship id, sender id…). */
    @Column
    private Long refId;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column
    private Instant readAt;

    public Notification() {
    }

    public Notification(Long userId, Type type, String text, Long refId) {
        this.userId = userId;
        this.type = type.name();
        this.text = text;
        this.refId = refId;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public Long getRefId() {
        return refId;
    }

    public void setRefId(Long refId) {
        this.refId = refId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public void setReadAt(Instant readAt) {
        this.readAt = readAt;
    }
}
