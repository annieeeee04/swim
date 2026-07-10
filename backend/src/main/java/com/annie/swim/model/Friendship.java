package com.annie.swim.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

/**
 * A directed friendship edge: {@code requester} asked {@code addressee} to be
 * friends. While {@code status == PENDING} it's an open friend request; once
 * ACCEPTED the pair are friends (a single row represents the whole
 * relationship — queries look at both directions).
 */
@Entity
@Table(name = "friendships",
        uniqueConstraints = @UniqueConstraint(columnNames = {"requesterId", "addresseeId"}))
public class Friendship {

    public enum Status {
        PENDING, ACCEPTED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long requesterId;

    @Column(nullable = false)
    private Long addresseeId;

    @Column(nullable = false)
    private String status = Status.PENDING.name();

    /** Optional note the requester attached ("Hi, we swam in lane 3 together!"). */
    @Column(length = 300)
    private String message;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column
    private Instant respondedAt;

    public Friendship() {
    }

    public Friendship(Long requesterId, Long addresseeId) {
        this.requesterId = requesterId;
        this.addresseeId = addresseeId;
    }

    public Friendship(Long requesterId, Long addresseeId, String message) {
        this(requesterId, addresseeId);
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getRequesterId() {
        return requesterId;
    }

    public void setRequesterId(Long requesterId) {
        this.requesterId = requesterId;
    }

    public Long getAddresseeId() {
        return addresseeId;
    }

    public void setAddresseeId(Long addresseeId) {
        this.addresseeId = addresseeId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getRespondedAt() {
        return respondedAt;
    }

    public void setRespondedAt(Instant respondedAt) {
        this.respondedAt = respondedAt;
    }
}
