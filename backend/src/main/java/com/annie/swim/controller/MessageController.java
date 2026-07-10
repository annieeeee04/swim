package com.annie.swim.controller;

import com.annie.swim.dto.UserSummary;
import com.annie.swim.model.DirectMessage;
import com.annie.swim.model.Notification;
import com.annie.swim.model.User;
import com.annie.swim.repository.DirectMessageRepository;
import com.annie.swim.repository.UserRepository;
import com.annie.swim.service.AuthService;
import com.annie.swim.service.PushService;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Direct messages. Friends chat freely; you can also message a stranger, but
 * only {@value #STRANGER_MESSAGE_LIMIT} intro messages until they accept a
 * friend request — enough to say hi, not enough to spam.
 */
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final DirectMessageRepository messages;
    private final UserRepository users;
    private final AuthService auth;
    private final SocialService social;
    private final PushService push;

    public MessageController(DirectMessageRepository messages, UserRepository users,
                             AuthService auth, SocialService social, PushService push) {
        this.messages = messages;
        this.users = users;
        this.auth = auth;
        this.social = social;
        this.push = push;
    }

    /**
     * The chat list: one entry per conversation partner (friend or stranger),
     * newest activity first — powers the browsable chat section.
     */
    @GetMapping
    public List<ChatListItem> chats(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);

        // Newest message per partner (list is already newest-first).
        Map<Long, DirectMessage> lastByPartner = new LinkedHashMap<>();
        for (DirectMessage m : messages.findAllInvolving(me.getId())) {
            Long partner = Objects.equals(m.getSenderId(), me.getId()) ? m.getRecipientId() : m.getSenderId();
            lastByPartner.putIfAbsent(partner, m);
        }

        Map<Long, Long> unread = new HashMap<>();
        for (DirectMessage m : messages.findByRecipientIdAndReadAtIsNull(me.getId())) {
            unread.merge(m.getSenderId(), 1L, Long::sum);
        }

        Set<Long> friendIds = new HashSet<>(social.friendIdsOf(me.getId()));

        List<ChatListItem> out = new ArrayList<>();
        for (Map.Entry<Long, DirectMessage> e : lastByPartner.entrySet()) {
            User partner = users.findById(e.getKey()).orElse(null);
            if (partner == null) {
                continue;
            }
            boolean friends = friendIds.contains(partner.getId());
            Integer introRemaining = friends
                    ? null
                    : social.remainingIntroMessages(me.getId(), partner.getId());
            DirectMessage last = e.getValue();
            out.add(new ChatListItem(
                    UserSummary.from(partner),
                    last.getBody(),
                    last.getSentAt(),
                    Objects.equals(last.getSenderId(), me.getId()),
                    unread.getOrDefault(partner.getId(), 0L),
                    friends,
                    introRemaining));
        }
        return out;
    }

    /** Unread-message counts per sender, for badges on the chat list. */
    @GetMapping("/unread")
    public Map<Long, Long> unread(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);
        Map<Long, Long> counts = new HashMap<>();
        for (DirectMessage m : messages.findByRecipientIdAndReadAtIsNull(me.getId())) {
            counts.merge(m.getSenderId(), 1L, Long::sum);
        }
        return counts;
    }

    /** Conversation with anyone, oldest first. Marks their messages to you read. */
    @GetMapping("/{otherId}")
    public List<DirectMessage> conversation(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long otherId) {
        User me = auth.requireUser(authHeader);
        List<DirectMessage> conv = messages.findConversation(me.getId(), otherId);
        Instant now = Instant.now();
        for (DirectMessage m : conv) {
            if (m.getRecipientId().equals(me.getId()) && m.getReadAt() == null) {
                m.setReadAt(now);
            }
        }
        messages.saveAll(conv);
        return conv;
    }

    @PostMapping("/{otherId}")
    public DirectMessage send(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long otherId,
            @RequestBody SendMessage body) {
        User me = auth.requireUser(authHeader);
        User other = users.findById(otherId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));
        if (Objects.equals(other.getId(), me.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can't message yourself");
        }
        if (body.body() == null || body.body().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "message body is required");
        }

        // Stranger chat: capped intro messages until they accept a friend request.
        if (!social.areFriends(me.getId(), other.getId())
                && social.remainingIntroMessages(me.getId(), other.getId()) <= 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You've used your " + SocialService.STRANGER_MESSAGE_LIMIT
                            + " intro messages — send " + other.getDisplayName()
                            + " a friend request to keep chatting.");
        }

        String text = body.body().trim();
        if (text.length() > 2000) {
            text = text.substring(0, 2000);
        }
        DirectMessage saved = messages.save(new DirectMessage(me.getId(), other.getId(), text));
        // Instant delivery to any open chat window; the notification below
        // (also pushed) covers the bell for users elsewhere in the app.
        push.sendToUser(other.getId(), "message", saved);
        social.notify(other.getId(), Notification.Type.MESSAGE,
                me.getDisplayName() + ": " + (text.length() > 80 ? text.substring(0, 80) + "…" : text),
                me.getId());
        return saved;
    }

    public record SendMessage(String body) {
    }

    /**
     * One row in the chat list.
     *
     * @param introRemaining messages you may still send before friending
     *                       (null when you're already friends)
     */
    public record ChatListItem(
            UserSummary user,
            String lastBody,
            Instant lastAt,
            boolean lastFromMe,
            long unread,
            boolean friends,
            Integer introRemaining) {
    }
}
