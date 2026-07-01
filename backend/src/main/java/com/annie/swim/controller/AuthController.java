package com.annie.swim.controller;

import com.annie.swim.dto.UserView;
import com.annie.swim.model.User;
import com.annie.swim.repository.UserRepository;
import com.annie.swim.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Email/password authentication + profile management. Tokens are returned in
 * the body; the frontend stores them and replays them as a Bearer header.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    private final UserRepository users;

    public AuthController(AuthService auth, UserRepository users) {
        this.auth = auth;
        this.users = users;
    }

    @PostMapping("/signup")
    public AuthResponse signup(@RequestBody SignupRequest req) {
        User user = auth.signup(req.email(), req.password(), req.displayName());
        applyProfile(user, req.gender(), req.age(), req.avatarSkin(), req.avatarSuit(), req.avatarCap(), req.avatarBase());
        users.save(user);
        return new AuthResponse(auth.issueToken(user), UserView.from(user));
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody LoginRequest req) {
        User user = auth.login(req.email(), req.password());
        return new AuthResponse(auth.issueToken(user), UserView.from(user));
    }

    @GetMapping("/me")
    public UserView me(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authHeader) {
        return UserView.from(auth.requireUser(authHeader));
    }

    @PostMapping("/logout")
    public void logout(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authHeader) {
        auth.logout(authHeader);
    }

    /** Update display name / gender / age / avatar colors. */
    @PutMapping("/profile")
    public UserView updateProfile(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authHeader,
            @RequestBody ProfileRequest req) {
        User user = auth.requireUser(authHeader);
        if (req.displayName() != null && !req.displayName().isBlank()) {
            user.setDisplayName(req.displayName().trim());
        }
        applyProfile(user, req.gender(), req.age(), req.avatarSkin(), req.avatarSuit(), req.avatarCap(), req.avatarBase());
        return UserView.from(users.save(user));
    }

    /** Upload (or clear) the profile photo. Stored as a data URL, used only on
     *  the records & leaderboard screens — never as the in-pool swimmer. */
    @PostMapping("/photo")
    public UserView setPhoto(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authHeader,
            @RequestBody PhotoRequest req) {
        User user = auth.requireUser(authHeader);
        String dataUrl = req.dataUrl();
        if (dataUrl != null && !dataUrl.isBlank()) {
            if (!dataUrl.startsWith("data:image/")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "photo must be an image data URL");
            }
            // ~5MB base64 guard so a giant upload can't wedge the DB.
            if (dataUrl.length() > 7_000_000) {
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "image is too large (max ~5MB)");
            }
        }
        user.setPhotoUrl(dataUrl == null || dataUrl.isBlank() ? null : dataUrl);
        return UserView.from(users.save(user));
    }

    private void applyProfile(User user, String gender, Integer age, String skin, String suit, String cap, String base) {
        if (gender != null) {
            user.setGender(gender);
        }
        if (age != null) {
            user.setAge(age);
        }
        if (skin != null) {
            user.setAvatarSkin(skin);
        }
        if (suit != null) {
            user.setAvatarSuit(suit);
        }
        if (cap != null) {
            user.setAvatarCap(cap);
        }
        if (base != null) {
            user.setAvatarBase(base);
        }
    }

    public record SignupRequest(
            String email,
            String password,
            String displayName,
            String gender,
            Integer age,
            String avatarSkin,
            String avatarSuit,
            String avatarCap,
            String avatarBase) {
    }

    public record LoginRequest(String email, String password) {
    }

    public record ProfileRequest(
            String displayName,
            String gender,
            Integer age,
            String avatarSkin,
            String avatarSuit,
            String avatarCap,
            String avatarBase) {
    }

    public record PhotoRequest(String dataUrl) {
    }

    public record AuthResponse(String token, UserView user) {
    }
}
