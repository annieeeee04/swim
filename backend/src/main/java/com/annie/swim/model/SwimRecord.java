package com.annie.swim.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One swim session logged by a user in the "Pool" tab: which character they
 * picked, which lane they were assigned, whether they swam 25m or 50m pool
 * length, and (once they're done) how far they actually swam in real life.
 */
@Entity
@Table(name = "swim_records")
public class SwimRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String character;

    /** Pool length chosen for the swim: 25 or 50 (meters). */
    @Column(nullable = false)
    private int poolLength;

    /** Lane number assigned for this swim, 1-10. */
    @Column(nullable = false)
    private int lane;

    /** Owner of this swim, if logged in. Null for anonymous/legacy swims. */
    @Column
    private Long userId;

    /** Distance the user actually swam, in meters. Null until they finish and report it. */
    @Column
    private Double distanceMeters;

    @Column(nullable = false)
    private Instant startedAt;

    @Column
    private Instant completedAt;

    public SwimRecord() {
    }

    public SwimRecord(String character, int poolLength, int lane) {
        this.character = character;
        this.poolLength = poolLength;
        this.lane = lane;
        this.startedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCharacter() {
        return character;
    }

    public void setCharacter(String character) {
        this.character = character;
    }

    public int getPoolLength() {
        return poolLength;
    }

    public void setPoolLength(int poolLength) {
        this.poolLength = poolLength;
    }

    public int getLane() {
        return lane;
    }

    public void setLane(int lane) {
        this.lane = lane;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Double getDistanceMeters() {
        return distanceMeters;
    }

    public void setDistanceMeters(Double distanceMeters) {
        this.distanceMeters = distanceMeters;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }
}
