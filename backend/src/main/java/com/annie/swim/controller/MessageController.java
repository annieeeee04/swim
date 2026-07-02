package com.annie.swim.controller;

import com.annie.swim.model.DirectMessage;
import com.annie.swim.model.Notification;
import com.annie.swim.model.User;
import com.annie.swim.repository.DirectMessageRepository;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Direct messages between friends (simple polling chat). */
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final DirectMessageRepository messages;
    private final AuthService auth;
    private final SocialService social;

    public MessageController(DirectMessageRepository messages, AuthService auth, SocialService social) {
        this.messages = messages;
        this.auth = auth;
        this.social = social;
    }

    /** Unread-message counts per sender, for badges on the friend list. */
    @GetMapping("/unread")
    public Map<Long, Long> unread(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);
        Map<Long, Long> counts = new HashMap<>();
        for (DirectMessage m : messages.findByRecipientIdAndReadAtIsNull(me.getId())) {
            counts.merge(m.getSenderId(), 1L, Long::sum);
        }
        return counts;
    }

    /** Conversation with a friend, oldest first. Marks their messages to you read. */
    @GetMapping("/{friendId}")
    public List<DirectMessage> conversation(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long friendId) {
        User me = auth.requireUser(authHeader);
        social.requireFriends(me.getId(), friendId);
        List<DirectMessage> conv = messages.findConversation(me.getId(), friendId);
        Instant now = Instant.now();
        for (DirectMessage m : conv) {
            if (m.getRecipientId().equals(me.getId()) && m.getReadAt() == null) {
                m.setReadAt(now);
            }
        }
        messages.saveAll(conv);
        return conv;
    }

    @PostMapping("/{friendId}")
    public DirectMessage send(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader,
            @PathVariable Long friendId,
            @RequestBody SendMessage body) {
        User me = auth.requireUser(authHeader);
        social.requireFriends(me.getId(), friendId);
        if (body.body() == null || body.body().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "message body is required");
        }
        String text = body.body().trim();
        if (text.length() > 2000) {
            text = text.substring(0, 2000);
        }
        DirectMessage saved = messages.save(new DirectMessage(me.getId(), friendId, text));
        social.notify(friendId, Notification.Type.MESSAGE,
                me.getDisplayName() + ": " + (text.length() > 80 ? text.substring(0, 80) + "…" : text),
                me.getId());
        return saved;
    }

    public record SendMessage(String body) {
    }
}
