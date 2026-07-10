package com.annie.swim.controller;

import com.annie.swim.dto.UserSummary;
import com.annie.swim.model.Friendship;
import com.annie.swim.model.SwimRecord;
import com.annie.swim.model.User;
import com.annie.swim.repository.FriendshipRepository;
import com.annie.swim.repository.SwimRecordRepository;
import com.annie.swim.repository.UserRepository;
import com.annie.swim.service.AuthService;
import com.annie.swim.service.SocialService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Objects;

/**
 * Public profile card for any user — what you see when you tap someone on the
 * ranking, in search results, or in a friend-request notification. Shows the
 * same aggregate stats as the leaderboard (never the private record list) plus
 * your relationship to them, so the frontend can offer the right actions
 * (add friend / accept / message / invite).
 */
@RestController
@RequestMapping("/api/users")
public class UserProfileController {

    private final UserRepository users;
    private final SwimRecordRepository records;
    private final FriendshipRepository friendships;
    private final AuthService auth;
    private final SocialService social;

    public UserProfileController(UserRepository users, SwimRecordRepository records,
                                 FriendshipRepository friendships, AuthService auth,
                                 SocialService social) {
        this.users = users;
        this.records = records;
        this.friendships = friendships;
        this.auth = auth;
        this.social = social;
    }

    @GetMapping("/{id}/profile")
    public ProfileView profile(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long id) {
        User me = auth.requireUser(authHeader);
        User them = users.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));

        // ---- relationship ----
        String relation = "none";
        Long incomingRequestId = null;
        String requestMessage = null;
        if (Objects.equals(me.getId(), them.getId())) {
            relation = "self";
        } else {
            Friendship f = friendships.findBetween(me.getId(), them.getId()).orElse(null);
            if (f != null) {
                if (Friendship.Status.ACCEPTED.name().equals(f.getStatus())) {
                    relation = "friends";
                } else if (Objects.equals(f.getRequesterId(), me.getId())) {
                    relation = "requested";
                    requestMessage = f.getMessage();
                } else {
                    relation = "incoming";
                    incomingRequestId = f.getId();
                    requestMessage = f.getMessage();
                }
            }
        }

        // ---- live presence ----
        boolean inPool = false;
        Integer lane = null;
        Integer poolLength = null;
        for (SwimRecord r : records.findByCompletedAtIsNull()) {
            if (Objects.equals(r.getUserId(), them.getId())) {
                inPool = true;
                lane = r.getLane();
                poolLength = r.getPoolLength();
                break;
            }
        }

        // ---- aggregate stats (public, leaderboard-grade only) ----
        int swims = 0;
        double total = 0;
        double longest = 0;
        for (SwimRecord r : records.findByUserIdOrderByStartedAtDesc(them.getId())) {
            if (r.getCompletedAt() == null || r.getDistanceMeters() == null) {
                continue;
            }
            swims++;
            total += r.getDistanceMeters();
            longest = Math.max(longest, r.getDistanceMeters());
        }

        Integer introRemaining = null;
        if (!"friends".equals(relation) && !"self".equals(relation)) {
            introRemaining = social.remainingIntroMessages(me.getId(), them.getId());
        }

        return new ProfileView(UserSummary.from(them), relation, incomingRequestId, requestMessage,
                inPool, lane, poolLength, swims, Math.round(total), Math.round(longest),
                introRemaining);
    }

    /**
     * @param relation        "self" | "friends" | "requested" | "incoming" | "none"
     * @param introRemaining  stranger-chat messages you may still send
     *                        (null when friends/self)
     */
    public record ProfileView(
            UserSummary user,
            String relation,
            Long incomingRequestId,
            String requestMessage,
            boolean inPool,
            Integer lane,
            Integer poolLength,
            int swims,
            long totalMeters,
            long longestMeters,
            Integer introRemaining) {
    }
}
