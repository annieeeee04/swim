package com.annie.swim.controller;

import com.annie.swim.model.SwimEvent;
import com.annie.swim.service.UbcFeedService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ScheduleController {

    private final UbcFeedService ubcFeedService;

    public ScheduleController(UbcFeedService ubcFeedService) {
        this.ubcFeedService = ubcFeedService;
    }

    /** Returns the cached (or freshly fetched, if stale) 7-day Length Swim schedule. */
    @GetMapping("/schedule")
    public ScheduleResponse getSchedule() {
        List<SwimEvent> events = ubcFeedService.getSchedule();
        return new ScheduleResponse(events, ubcFeedService.lastUpdated().toString());
    }

    /** Forces a fresh fetch from UBC, bypassing the cache TTL. */
    @PostMapping("/schedule/refresh")
    public ScheduleResponse forceRefresh() {
        List<SwimEvent> events = ubcFeedService.forceRefresh();
        return new ScheduleResponse(events, ubcFeedService.lastUpdated().toString());
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "time", Instant.now().toString());
    }

    public record ScheduleResponse(List<SwimEvent> events, String lastUpdated) {
    }
}
