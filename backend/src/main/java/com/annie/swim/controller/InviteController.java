package com.annie.swim.controller;

import com.annie.swim.dto.UserSummary;
import com.annie.swim.model.Notification;
import com.annie.swim.model.SwimInvite;
import com.annie.swim.model.User;
import com.annie.swim.repository.SwimInviteRepository;
import com.annie.swim.repository.UserRepository;
import com.annie.swim.service.AuthService;
import com.annie.swim.service.SocialService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Swim-together invitations. The inviter picks a real session from the UBC
 * schedule (start/end window + 25m/50m pool) and sends it to a friend; when
 * the friend accepts, BOTH users get a notification, and the plan shows up
 * for both so they can find each other at the pool in person.
 */
@RestController
@RequestMapping("/api/invites")
public class InviteController {

    private static final DateTimeFormatter FEED_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SwimInviteRepository invites;
    private final UserRepository users;
    private final AuthService auth;
    private final SocialService social;

    public InviteController(SwimInviteRepository invites, UserRepository users,
                            AuthService auth, SocialService social) {
        this.invites = invites;
        this.users = users;
        this.auth = auth;
        this.social = social;
    }

    /** Every invite you're part of (both directions), newest first. */
    @GetMapping
    public List<InviteView> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);
        List<InviteView> out = new ArrayList<>();
        for (SwimInvite i : invites.findAllFor(me.getId())) {
            out.add(toView(i, me.getId()));
        }
        return out;
    }

    @PostMapping
    public InviteView create(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @RequestBody CreateInvite body) {
        User me = auth.requireUser(authHeader);
        if (body.friendId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "friendId is required");
        }
        social.requireFriends(me.getId(), body.friendId());
        if (body.poolLength() != 25 && body.poolLength() != 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "poolLength must be 25 or 50");
        }
        validateFeedTime(body.sessionStart(), "sessionStart");
        validateFeedTime(body.sessionEnd(), "sessionEnd");

        SwimInvite invite = invites.save(new SwimInvite(
                me.getId(), body.friendId(), body.sessionStart(), body.sessionEnd(),
                body.poolLength(), body.note()));
        social.notify(body.friendId(), Notification.Type.INVITE,
                me.getDisplayName() + " invited you to swim together (" + body.poolLength()
                        + "m pool, " + body.sessionStart() + ")", invite.getId());
        return toView(invite, me.getId());
    }

    @PostMapping("/{id}/accept")
    public InviteView accept(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long id) {
        User me = auth.requireUser(authHeader);
        SwimInvite invite = pendingInviteFor(me, id);
        invite.setStatus(SwimInvite.Status.ACCEPTED.name());
        invite.setRespondedAt(Instant.now());
        invites.save(invite);

        // Both sides get told the plan is on.
        String when = invite.getSessionStart();
        social.notify(invite.getInviterId(), Notification.Type.INVITE_ACCEPTED,
                me.getDisplayName() + " accepted your swim invite — see you in the "
                        + invite.getPoolLength() + "m pool (" + when + ")!", invite.getId());
        User inviter = users.findById(invite.getInviterId()).orElse(null);
        social.notify(me.getId(), Notification.Type.INVITE_ACCEPTED,
                "Swim confirmed with " + (inviter != null ? inviter.getDisplayName() : "your friend")
                        + " — " + invite.getPoolLength() + "m pool (" + when + ")!", invite.getId());
        return toView(invite, me.getId());
    }

    @PostMapping("/{id}/decline")
    public InviteView decline(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long id) {
        User me = auth.requireUser(authHeader);
        SwimInvite invite = pendingInviteFor(me, id);
        invite.setStatus(SwimInvite.Status.DECLINED.name());
        invite.setRespondedAt(Instant.now());
        invites.save(invite);
        social.notify(invite.getInviterId(), Notification.Type.INVITE_DECLINED,
                me.getDisplayName() + " can't make the " + invite.getPoolLength() + "m swim ("
                        + invite.getSessionStart() + ")", invite.getId());
        return toView(invite, me.getId());
    }

    private SwimInvite pendingInviteFor(User me, Long id) {
        SwimInvite invite = invites.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "invite not found"));
        if (!Objects.equals(invite.getInviteeId(), me.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This invite isn't addressed to you");
        }
        if (!SwimInvite.Status.PENDING.name().equals(invite.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Invite already handled");
        }
        return invite;
    }

    private static void validateFeedTime(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        }
        try {
            LocalDateTime.parse(value, FEED_FORMAT);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    field + " must be formatted yyyy-MM-dd HH:mm:ss");
        }
    }

    private InviteView toView(SwimInvite i, Long meId) {
        boolean outgoing = Objects.equals(i.getInviterId(), meId);
        Long otherId = outgoing ? i.getInviteeId() : i.getInviterId();
        User other = users.findById(otherId).orElse(null);
        return new InviteView(
                i.getId(),
                outgoing ? "outgoing" : "incoming",
                other != null ? UserSummary.from(other) : null,
                i.getSessionStart(),
                i.getSessionEnd(),
                i.getPoolLength(),
                i.getNote(),
                i.getStatus(),
                i.getCreatedAt());
    }

    public record CreateInvite(Long friendId, String sessionStart, String sessionEnd,
                               int poolLength, String note) {
    }

    public record InviteView(Long id, String direction, UserSummary friend, String sessionStart,
                             String sessionEnd, int poolLength, String note, String status,
                             Instant createdAt) {
    }
}
