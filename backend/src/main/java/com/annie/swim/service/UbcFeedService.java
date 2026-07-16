package com.annie.swim.service;

import com.annie.swim.model.SwimEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Fetches the next 7 days of UBC Aquatic Centre drop-in sessions from the
 * public pm-feed endpoint, filters down to plain 25m/50m Length Swim
 * drop-in sessions, and caches the result for a configurable window so the
 * frontend (and anyone hammering refresh) doesn't hit UBC's feed on every
 * request.
 *
 * Filter matches Annie's Cowork scheduled check: only servicename
 * "Drop-in - 25m Length Swim" / "Drop-in - 50m Length Swim" — excludes
 * Aqua Fitness, Community Swim, Sensory-Sensitive, and 2STNB sessions.
 */
@Service
public class UbcFeedService {

    private static final Logger log = LoggerFactory.getLogger(UbcFeedService.class);

    private static final ZoneId VANCOUVER = ZoneId.of("America/Vancouver");
    private static final DateTimeFormatter REQUEST_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private static final Set<String> TARGET_SERVICES = Set.of(
            "drop-in - 25m length swim",
            "drop-in - 50m length swim"
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final long cacheMillis;

    private final ReentrantLock refreshLock = new ReentrantLock();

    private volatile List<SwimEvent> cachedEvents = List.of();
    private volatile Instant cachedAt = Instant.EPOCH;

    public UbcFeedService(@Value("${app.schedule.cache-minutes:10}") long cacheMinutes) {
        this.cacheMillis = Duration.ofMinutes(cacheMinutes).toMillis();
    }

    /** Returns the cached schedule, refreshing it first if the cache is stale. */
    public List<SwimEvent> getSchedule() {
        if (isStale()) {
            refresh();
        }
        return cachedEvents;
    }

    /** Forces a fresh fetch from UBC regardless of cache age. */
    public List<SwimEvent> forceRefresh() {
        refresh();
        return cachedEvents;
    }

    public Instant lastUpdated() {
        return cachedAt;
    }

    private boolean isStale() {
        return Instant.now().toEpochMilli() - cachedAt.toEpochMilli() > cacheMillis;
    }

    private void refresh() {
        refreshLock.lock();
        try {
            // Another thread may have just refreshed while we waited for the lock.
            if (!isStale() && !cachedEvents.isEmpty()) {
                return;
            }

            LocalDate today = LocalDate.now(VANCOUVER);
            // Fetch the full 7-day window in a single call to avoid any day-boundary
            // issues that can occur when fetching day-by-day (e.g. the pm-feed treating
            // the start/end parameters as UTC vs. Pacific, causing today's sessions to
            // fall outside the requested window).
            List<SwimEvent> raw = fetchRange(today, today.plusDays(7));

            List<SwimEvent> filtered = new ArrayList<>();
            for (SwimEvent ev : raw) {
                if (isTargetSession(ev)) {
                    filtered.add(ev);
                }
            }
            filtered.sort((a, b) -> a.getStart().compareTo(b.getStart()));

            cachedEvents = List.copyOf(filtered);
            cachedAt = Instant.now();
            log.info("Refreshed UBC schedule cache: {} sessions (7-day window from {}).",
                    cachedEvents.size(), today);
        } finally {
            refreshLock.unlock();
        }
    }

    private boolean isTargetSession(SwimEvent ev) {
        return ev.getServiceName() != null && TARGET_SERVICES.contains(ev.getServiceName().trim().toLowerCase());
    }

    /**
     * Fetches all events from the UBC pm-feed for the given date range in a single
     * HTTP request. Both {@code start} and {@code end} are expressed as Vancouver
     * local midnight so the feed receives a clean Pacific-time window regardless of
     * the server's own system timezone.
     */
    private List<SwimEvent> fetchRange(LocalDate start, LocalDate end) {
        String startStr = start.atStartOfDay().format(REQUEST_FORMAT).replace(":", "%3A");
        String endStr = end.atStartOfDay().format(REQUEST_FORMAT).replace(":", "%3A");

        String url = "https://recreation.ubc.ca/pm-feed/?calendarname=Aquatic%20Centre&eventlocation=Null"
                + "&services=Null&ecolor=%23DD732D&closuresonly=N&teams&exclude&keywords&facilitytype"
                + "&start=" + startStr + "&end=" + endStr;

        log.debug("Fetching UBC feed: {}", url);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("UBC feed returned HTTP {} for range {}-{}", response.statusCode(), start, end);
                return List.of();
            }
            SwimEvent[] events = objectMapper.readValue(response.body(), SwimEvent[].class);
            log.info("UBC feed returned {} raw events for {}-{}", events.length, start, end);
            return Arrays.asList(events);
        } catch (Exception e) {
            log.error("Failed to fetch UBC feed for range {}-{}: {}", start, end, e.getMessage());
            return List.of();
        }
    }
}
