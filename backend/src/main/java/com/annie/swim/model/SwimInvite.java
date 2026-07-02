package com.annie.swim.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * "Come swim with me!" — an invitation from one friend to another to meet at
 * a specific Length Swim session (a start/end window from the real UBC
 * schedule, plus the 25m/50m pool). Once the invitee accepts, both users are
 * notified and both see the session as a planned swim together.
 */
@Entity
@Table(name = "swim_invites")
public class SwimInvite {

    public enum Status {
        PENDING, ACCEPTED, DECLINED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long inviterId;

    @Column(nullable = false)
    private Long inviteeId;

    /** Session start, "yyyy-MM-dd HH:mm:ss" America/Vancouver, straight from the UBC feed. */
    @Column(nullable = false)
    private String sessionStart;

    @Column(nullable = false)
    private String sessionEnd;

    /** Pool for the meetup: 25 or 50 (meters). */
    @Column(nullable = false)
    private int poolLength;

    @Column
    private String note;

    @Column(nullable = false)
    private String status = Status.PENDING.name();

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column
    private Instant respondedAt;

    public SwimInvite() {
    }

    public SwimInvite(Long inviterId, Long inviteeId, String sessionStart, String sessionEnd,
                      int poolLength, String note) {
        this.inviterId = inviterId;
        this.inviteeId = inviteeId;
        this.sessionStart = sessionStart;
        this.sessionEnd = sessionEnd;
        this.poolLength = poolLength;
        this.note = note;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getInviterId() {
        return inviterId;
    }

    public void setInviterId(Long inviterId) {
        this.inviterId = inviterId;
    }

    public Long getInviteeId() {
        return inviteeId;
    }

    public void setInviteeId(Long inviteeId) {
        this.inviteeId = inviteeId;
    }

    public String getSessionStart() {
        return sessionStart;
    }

    public void setSessionStart(String sessionStart) {
        this.sessionStart = sessionStart;
    }

    public String getSessionEnd() {
        return sessionEnd;
    }

    public void setSessionEnd(String sessionEnd) {
        this.sessionEnd = sessionEnd;
    }

    public int getPoolLength() {
        return poolLength;
    }

    public void setPoolLength(int poolLength) {
        this.poolLength = poolLength;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
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
