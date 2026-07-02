package com.annie.swim.dto;

import com.annie.swim.model.User;

/**
 * The tiny public slice of a user shown to *other* users — enough to render
 * a friend card and their in-pool avatar, and nothing private (no email).
 */
public record UserSummary(
        Long id,
        String displayName,
        String avatarSkin,
        String avatarSuit,
        String avatarCap,
        String photoUrl) {

    public static UserSummary from(User u) {
        return new UserSummary(
                u.getId(),
                u.getDisplayName(),
                orDefault(u.getAvatarSkin(), "#f3c89e"),
                orDefault(u.getAvatarSuit(), "#ec4899"),
                orDefault(u.getAvatarCap(), "#a855f7"),
                u.getPhotoUrl());
    }

    private static String orDefault(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
}
