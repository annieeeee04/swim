package com.annie.swim.service;

import com.annie.swim.model.Friendship;
import com.annie.swim.model.Notification;
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

    private final FriendshipRepository friendships;
    private final NotificationRepository notifications;
    private final PushService push;

    public SocialService(FriendshipRepository friendships, NotificationRepository notifications,
                         PushService push) {
        this.friendships = friendships;
        this.notifications = notifications;
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

    /** Saves an in-app notification AND pushes it live over the user's WebSocket. */
    public void notify(Long userId, Notification.Type type, String text, Long refId) {
        Notification saved = notifications.save(new Notification(userId, type, text, refId));
        push.sendToUser(userId, "notification", saved);
    }
}
