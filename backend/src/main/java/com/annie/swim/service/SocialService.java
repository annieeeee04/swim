package com.annie.swim.service;

import com.annie.swim.model.Friendship;
import com.annie.swim.model.Notification;
import com.annie.swim.repository.DirectMessageRepository;
import com.annie.swim.repository.FriendshipRepository;
import com.annie.swim.repository.NotificationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Shared helpers for the social features: friendship checks + notifications. */
@Service
public class SocialService {

    /** Max messages you can send someone who isn't (yet) your friend. */
    public static final int STRANGER_MESSAGE_LIMIT = 3;

    private final FriendshipRepository friendships;
    private final NotificationRepository notifications;
    private final DirectMessageRepository messages;
    private final PushService push;

    public SocialService(FriendshipRepository friendships, NotificationRepository notifications,
                         DirectMessageRepository messages, PushService push) {
        this.friendships = friendships;
        this.notifications = notifications;
        this.messages = messages;
        this.push = push;
    }

    public boolean areFriends(Long a, Long b) {
        return friendships.findBetween(a, b)
                .map(f -> Friendship.Status.ACCEPTED.name().equals(f.getStatus()))
                .orElse(false);
    }

    /** Throws 403 unless the two users are accepted friends. */
    public void requireFriends(Long a, Long b) {
        if (!areFriends(a, b)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not friends with this user");
        }
    }

    /** Ids of everyone the user is (accepted-)friends with. */
    public List<Long> friendIdsOf(Long userId) {
        List<Long> out = new ArrayList<>();
        for (Friendship f : friendships.findAcceptedFor(userId)) {
            out.add(Objects.equals(f.getRequesterId(), userId) ? f.getAddresseeId() : f.getRequesterId());
        }
        return out;
    }

    /** Stranger-chat allowance: intro messages left before a friendship is required. */
    public int remainingIntroMessages(Long fromId, Long toId) {
        return (int) Math.max(0,
                STRANGER_MESSAGE_LIMIT - messages.countBySenderIdAndRecipientId(fromId, toId));
    }

    /** Saves an in-app notification AND pushes it live over the user's WebSocket. */
    public void notify(Long userId, Notification.Type type, String text, Long refId) {
        Notification saved = notifications.save(new Notification(userId, type, text, refId));
        push.sendToUser(userId, "notification", saved);
    }
}
