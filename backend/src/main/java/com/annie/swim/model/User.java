package com.annie.swim.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A registered swimmer. Accounts can be created locally (email + password)
 * or via a third-party provider (Google / Instagram). Each user carries a
 * playful avatar (skin / suit / cap colors, plus an optional generated base
 * "character") that becomes their swimmer in the pool, and an optional
 * uploaded profile photo used only on the records & leaderboard screens.
 */
@Entity
@Table(name = "users")
public class User {

    public enum Provider {
        LOCAL, GOOGLE, FACEBOOK
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String displayName;

    /** BCrypt hash. Null for accounts created purely through OAuth. */
    @Column
    private String passwordHash;

    @Column(nullable = false)
    private String provider = Provider.LOCAL.name();

    /** Stable id from the OAuth provider (sub / user id). Null for local accounts. */
    @Column
    private String providerId;

    /** Free-text gender supplied at signup (used to seed the generated avatar). */
    @Column
    private String gender;

    @Column
    private Integer age;

    // ---- avatar (the swimmer that enters the pool) ----
    @Column
    private String avatarSkin;

    @Column
    private String avatarSuit;

    @Column
    private String avatarCap;

    /** Optional id of the auto-generated "base" look, for reference/analytics. */
    @Column
    private String avatarBase;

    /** Uploaded profile photo as a data URL. Used ONLY for records/leaderboard,
     *  never as the in-pool swimmer. Stored as a CLOB so base64 fits. */
    @Lob
    @Column
    private String photoUrl;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public User() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getProviderId() {
        return providerId;
    }

    public void setProviderId(String providerId) {
        this.providerId = providerId;
    }

    public String getGender() {
        return gender;
    }

    public void setGender(String gender) {
        this.gender = gender;
    }

    public Integer getAge() {
        return age;
    }

    public void setAge(Integer age) {
        this.age = age;
    }

    public String getAvatarSkin() {
        return avatarSkin;
    }

    public void setAvatarSkin(String avatarSkin) {
        this.avatarSkin = avatarSkin;
    }

    public String getAvatarSuit() {
        return avatarSuit;
    }

    public void setAvatarSuit(String avatarSuit) {
        this.avatarSuit = avatarSuit;
    }

    public String getAvatarCap() {
        return avatarCap;
    }

    public void setAvatarCap(String avatarCap) {
        this.avatarCap = avatarCap;
    }

    public String getAvatarBase() {
        return avatarBase;
    }

    public void setAvatarBase(String avatarBase) {
        this.avatarBase = avatarBase;
    }

    public String getPhotoUrl() {
        return photoUrl;
    }

    public void setPhotoUrl(String photoUrl) {
        this.photoUrl = photoUrl;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
