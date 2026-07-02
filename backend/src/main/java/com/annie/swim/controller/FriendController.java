package com.annie.swim.controller;

import com.annie.swim.dto.UserSummary;
import com.annie.swim.model.Friendship;
import com.annie.swim.model.Notification;
import com.annie.swim.model.SwimRecord;
import com.annie.swim.model.User;
import com.annie.swim.repository.FriendshipRepository;
import com.annie.swim.repository.SwimRecordRepository;
import com.annie.swim.repository.UserRepository;
import com.annie.swim.service.AuthService;
import com.annie.swim.service.SocialService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Instagram-style friend graph: search people, send/accept/decline friend
 * requests, list friends (with live "in the pool right now" presence + lane),
 * peek at a friend's swim records, and unfriend.
 */
@RestController
@RequestMapping("/api/friends")
public class FriendController {

    private final FriendshipRepository friendships;
    private final UserRepository users;
    private final SwimRecordRepository records;
    private final AuthService auth;
    private final SocialService social;

    public FriendController(FriendshipRepository friendships, UserRepository users,
                            SwimRecordRepository records, AuthService auth, SocialService social) {
        this.friendships = friendships;
        this.users = users;
        this.records = records;
        this.auth = auth;
        this.social = social;
    }

    /** Accepted friends with live pool presence (lane + pool if mid-swim). */
    @GetMapping
    public List<FriendView> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);

        // lane/pool of every currently-active (unfinished) swim, by user
        Map<Long, SwimRecord> activeByUser = new HashMap<>();
        for (SwimRecord r : records.findByCompletedAtIsNull()) {
            if (r.getUserId() != null) {
                activeByUser.put(r.getUserId(), r);
            }
        }

        List<FriendView> out = new ArrayList<>();
        for (Friendship f : friendships.findAcceptedFor(me.getId())) {
            Long friendId = Objects.equals(f.getRequesterId(), me.getId())
                    ? f.getAddresseeId() : f.getRequesterId();
            User friend = users.findById(friendId).orElse(null);
            if (friend == null) {
                continue;
            }
            SwimRecord active = activeByUser.get(friendId);
            out.add(new FriendView(
                    UserSummary.from(friend),
                    active != null,
                    active != null ? active.getLane() : null,
                    active != null ? active.getPoolLength() : null,
                    f.getRespondedAt() != null ? f.getRespondedAt() : f.getCreatedAt()));
        }
        out.sort((a, b) -> Boolean.compare(b.inPool(), a.inPool()));
        return out;
    }

    /** People-search for the add-friend box; annotates each hit with the relationship. */
    @GetMapping("/search")
    public List<SearchHit> search(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @RequestParam("q") String q) {
        User me = auth.requireUser(authHeader);
        if (q == null || q.trim().length() < 2) {
            return List.of();
        }
        String needle = q.trim();
        List<SearchHit> out = new ArrayList<>();
        for (User u : users.findTop10ByDisplayNameContainingIgnoreCaseOrEmailContainingIgnoreCase(needle, needle)) {
            if (Objects.equals(u.getId(), me.getId())) {
                continue;
            }
            String relation = friendships.findBetween(me.getId(), u.getId())
                    .map(f -> Friendship.Status.ACCEPTED.name().equals(f.getStatus())
                            ? "friends"
                            : (Objects.equals(f.getRequesterId(), me.getId()) ? "requested" : "incoming"))
                    .orElse("none");
            out.add(new SearchHit(UserSummary.from(u), relation));
        }
        return out;
    }

    /** Incoming + outgoing pending requests. */
    @GetMapping("/requests")
    public RequestsView requests(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);
        List<RequestView> incoming = new ArrayList<>();
        for (Friendship f : friendships.findByAddresseeIdAndStatusOrderByCreatedAtDesc(
                me.getId(), Friendship.Status.PENDING.name())) {
            users.findById(f.getRequesterId())
                    .ifPresent(u -> incoming.add(new RequestView(f.getId(), UserSummary.from(u), f.getCreatedAt())));
        }
        List<RequestView> outgoing = new ArrayList<>();
        for (Friendship f : friendships.findByRequesterIdAndStatusOrderByCreatedAtDesc(
                me.getId(), Friendship.Status.PENDING.name())) {
            users.findById(f.getAddresseeId())
                    .ifPresent(u -> outgoing.add(new RequestView(f.getId(), UserSummary.from(u), f.getCreatedAt())));
        }
        return new RequestsView(incoming, outgoing);
    }

    /** Sends a friend request (auto-accepts if the other person already asked you). */
    @PostMapping("/requests")
    public RequestView sendRequest(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @RequestBody SendRequest body) {
        User me = auth.requireUser(authHeader);
        if (body.userId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "userId is required");
        }
        if (Objects.equals(body.userId(), me.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can't friend yourself");
        }
        User other = users.findById(body.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));

        Friendship existing = friendships.findBetween(me.getId(), other.getId()).orElse(null);
        if (existing != null) {
            if (Friendship.Status.ACCEPTED.name().equals(existing.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "You are already friends");
            }
            if (Objects.equals(existing.getRequesterId(), me.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Request already sent");
            }
            // They already asked us — accept instead of duplicating.
            return accept(authHeader, existing.getId());
        }

        Friendship f = friendships.save(new Friendship(me.getId(), other.getId()));
        social.notify(other.getId(), Notification.Type.FRIEND_REQUEST,
                me.getDisplayName() + " sent you a friend request", f.getId());
        return new RequestView(f.getId(), UserSummary.from(other), f.getCreatedAt());
    }

    @PostMapping("/requests/{id}/accept")
    public RequestView accept(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long id) {
        User me = auth.requireUser(authHeader);
        Friendship f = pendingRequestFor(me, id);
        f.setStatus(Friendship.Status.ACCEPTED.name());
        f.setRespondedAt(Instant.now());
        friendships.save(f);
        User requester = users.findById(f.getRequesterId()).orElse(null);
        social.notify(f.getRequesterId(), Notification.Type.FRIEND_ACCEPTED,
                me.getDisplayName() + " accepted your friend request — you're now friends!", f.getId());
        return new RequestView(f.getId(),
                requester != null ? UserSummary.from(requester) : null, f.getCreatedAt());
    }

    @PostMapping("/requests/{id}/decline")
    public void decline(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long id) {
        User me = auth.requireUser(authHeader);
        Friendship f = pendingRequestFor(me, id);
        friendships.delete(f);
    }

    @DeleteMapping("/{friendUserId}")
    public void unfriend(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long friendUserId) {
        User me = auth.requireUser(authHeader);
        friendships.findBetween(me.getId(), friendUserId).ifPresent(friendships::delete);
    }

    /** A friend's swim history (friends only — this is the "check their records" view). */
    @GetMapping("/{friendUserId}/records")
    public List<SwimRecord> friendRecords(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long friendUserId) {
        User me = auth.requireUser(authHeader);
        social.requireFriends(me.getId(), friendUserId);
        return records.findByUserIdOrderByStartedAtDesc(friendUserId);
    }

    private Friendship pendingRequestFor(User me, Long id) {
        Friendship f = friendships.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "request not found"));
        if (!Objects.equals(f.getAddresseeId(), me.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This request isn't addressed to you");
        }
        if (!Friendship.Status.PENDING.name().equals(f.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Request already handled");
        }
        return f;
    }

    public record FriendView(UserSummary user, boolean inPool, Integer lane, Integer poolLength,
                             Instant friendsSince) {
    }

    public record SearchHit(UserSummary user, String relation) {
    }

    public record RequestView(Long id, UserSummary user, Instant createdAt) {
    }

    public record RequestsView(List<RequestView> incoming, List<RequestView> outgoing) {
    }

    public record SendRequest(Long userId) {
    }
}
