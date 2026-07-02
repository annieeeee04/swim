package com.annie.swim.service;

import com.annie.swim.model.Friendship;
import com.annie.swim.model.Notification;
import com.annie.swim.repository.FriendshipRepository;
import com.annie.swim.repository.NotificationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Shared helpers for the social features: friendship checks + notifications. */
@Service
public class SocialService {

    private final FriendshipRepository friendships;
    private final NotificationRepository notifications;

    public SocialService(FriendshipRepository friendships, NotificationRepository notifications) {
        this.friendships = friendships;
        this.notifications = notifications;
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

    public void notify(Long userId, Notification.Type type, String text, Long refId) {
        notifications.save(new Notification(userId, type, text, refId));
    }
}
