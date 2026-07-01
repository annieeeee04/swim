package com.annie.swim.service;

import com.annie.swim.model.AuthSession;
import com.annie.swim.model.User;
import com.annie.swim.repository.AuthSessionRepository;
import com.annie.swim.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

/**
 * Lightweight, self-contained auth: BCrypt password hashing plus opaque bearer
 * tokens persisted in {@link AuthSession}. Intentionally avoids Spring Security
 * so the app's existing open endpoints (schedule, swim records) stay open while
 * a handful of endpoints can opt in to "must be logged in" via {@link #requireUser}.
 */
@Service
public class AuthService {

    private static final long TOKEN_TTL_DAYS = 30;

    private final UserRepository users;
    private final AuthSessionRepository sessions;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();

    public AuthService(UserRepository users, AuthSessionRepository sessions) {
        this.users = users;
        this.sessions = sessions;
    }

    // ---------- registration / login ----------

    public User signup(String email, String password, String displayName) {
        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email is required");
        }
        if (password == null || password.length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "password must be at least 6 characters");
        }
        if (users.existsByEmailIgnoreCase(email.trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with that email already exists");
        }
        User u = new User();
        u.setEmail(email.trim());
        u.setDisplayName(displayName == null || displayName.isBlank() ? email.trim().split("@")[0] : displayName.trim());
        u.setPasswordHash(encoder.encode(password));
        u.setProvider(User.Provider.LOCAL.name());
        return users.save(u);
    }

    public User login(String email, String password) {
        User u = users.findByEmailIgnoreCase(email == null ? "" : email.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password"));
        if (u.getPasswordHash() == null || !encoder.matches(password, u.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        return u;
    }

    // ---------- tokens ----------

    public String issueToken(User user) {
        byte[] buf = new byte[36];
        random.nextBytes(buf);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
        sessions.save(new AuthSession(token, user.getId(), Instant.now().plus(TOKEN_TTL_DAYS, ChronoUnit.DAYS)));
        return token;
    }

    /** Resolves the logged-in user from an Authorization header, or null if absent/invalid. */
    public User optionalUser(String authHeader) {
        String token = extractToken(authHeader);
        if (token == null) {
            return null;
        }
        AuthSession session = sessions.findById(token).orElse(null);
        if (session == null || session.getExpiresAt().isBefore(Instant.now())) {
            return null;
        }
        return users.findById(session.getUserId()).orElse(null);
    }

    /** Like {@link #optionalUser} but throws 401 when there is no valid session. */
    public User requireUser(String authHeader) {
        User u = optionalUser(authHeader);
        if (u == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "You must be signed in");
        }
        return u;
    }

    public void logout(String authHeader) {
        String token = extractToken(authHeader);
        if (token != null) {
            sessions.deleteById(token);
        }
    }

    private String extractToken(String authHeader) {
        if (authHeader == null) {
            return null;
        }
        String trimmed = authHeader.trim();
        if (trimmed.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return trimmed.substring(7).trim();
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    // ---------- OAuth helper: find-or-create by provider ----------

    public User findOrCreateOAuthUser(User.Provider provider, String providerId, String email, String displayName) {
        return users.findByProviderAndProviderId(provider.name(), providerId)
                .or(() -> email == null ? java.util.Optional.empty() : users.findByEmailIgnoreCase(email))
                .map(existing -> {
                    // Link the provider to a pre-existing (e.g. local) account.
                    existing.setProvider(provider.name());
                    existing.setProviderId(providerId);
                    return users.save(existing);
                })
                .orElseGet(() -> {
                    User u = new User();
                    u.setEmail(email != null ? email : provider.name().toLowerCase() + "-" + providerId + "@swim.local");
                    u.setDisplayName(displayName != null ? displayName : "Swimmer");
                    u.setProvider(provider.name());
                    u.setProviderId(providerId);
                    return users.save(u);
                });
    }

    public UserRepository users() {
        return users;
    }
}
