package com.annie.swim.controller;

import com.annie.swim.model.Notification;
import com.annie.swim.model.User;
import com.annie.swim.repository.NotificationRepository;
import com.annie.swim.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** In-app notifications feed (the header bell polls these). */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationRepository notifications;
    private final AuthService auth;

    public NotificationController(NotificationRepository notifications, AuthService auth) {
        this.notifications = notifications;
        this.auth = auth;
    }

    @GetMapping
    public List<Notification> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);
        return notifications.findTop50ByUserIdOrderByCreatedAtDesc(me.getId());
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);
        return Map.of("count", notifications.countByUserIdAndReadAtIsNull(me.getId()));
    }

    @PostMapping("/read-all")
    public void readAll(@RequestHeader(HttpHeaders.AUTHORIZATION) String authHeader) {
        User me = auth.requireUser(authHeader);
        List<Notification> unread = notifications.findByUserIdAndReadAtIsNull(me.getId());
        Instant now = Instant.now();
        for (Notification n : unread) {
            n.setReadAt(now);
        }
        notifications.saveAll(unread);
    }
}
