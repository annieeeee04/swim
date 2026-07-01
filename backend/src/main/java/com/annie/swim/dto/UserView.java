package com.annie.swim.dto;

import com.annie.swim.model.User;

/**
 * Safe, public-facing view of a {@link User} — everything the frontend needs
 * to render a profile and the in-pool avatar, with the password hash omitted.
 */
public record UserView(
        Long id,
        String email,
        String displayName,
        String provider,
        String gender,
        Integer age,
        String avatarSkin,
        String avatarSuit,
        String avatarCap,
        String avatarBase,
        String photoUrl) {

    public static UserView from(User u) {
        return new UserView(
                u.getId(),
                u.getEmail(),
                u.getDisplayName(),
                u.getProvider(),
                u.getGender(),
                u.getAge(),
                u.getAvatarSkin(),
                u.getAvatarSuit(),
                u.getAvatarCap(),
                u.getAvatarBase(),
                u.getPhotoUrl());
    }
}
