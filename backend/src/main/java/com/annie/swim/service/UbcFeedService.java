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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
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
            List<CompletableFuture<List<SwimEvent>>> futures = new ArrayList<>();
            for (int offset = 0; offset < 7; offset++) {
                LocalDate start = today.plusDays(offset);
                LocalDate end = today.plusDays(offset + 1L);
                futures.add(fetchDayAsync(start, end));
            }

            Map<String, SwimEvent> merged = new LinkedHashMap<>();
            int successCount = 0;
            for (CompletableFuture<List<SwimEvent>> future : futures) {
                try {
                    List<SwimEvent> dayEvents = future.get();
                    successCount++;
                    for (SwimEvent ev : dayEvents) {
                        if (isTargetSession(ev)) {
                            merged.put(ev.getEventId(), ev);
                        }
                    }
                } catch (Exception e) {
                    log.warn("Failed to fetch a day of the UBC feed: {}", e.getMessage());
                }
            }

            if (successCount == 0) {
                log.error("All 7 day-fetches from the UBC feed failed; keeping previous cache.");
                return;
            }

            List<SwimEvent> sorted = new ArrayList<>(merged.values());
            sorted.sort((a, b) -> a.getStart().compareTo(b.getStart()));

            cachedEvents = List.copyOf(sorted);
            cachedAt = Instant.now();
            log.info("Refreshed UBC schedule cache: {} sessions ({}/{} days fetched).",
                    cachedEvents.size(), successCount, futures.size());
        } finally {
            refreshLock.unlock();
        }
    }

    private boolean isTargetSession(SwimEvent ev) {
        return ev.getServiceName() != null && TARGET_SERVICES.contains(ev.getServiceName().trim().toLowerCase());
    }

    private CompletableFuture<List<SwimEvent>> fetchDayAsync(LocalDate start, LocalDate end) {
        String startStr = start.atStartOfDay().format(REQUEST_FORMAT).replace(":", "%3A");
        String endStr = end.atStartOfDay().format(REQUEST_FORMAT).replace(":", "%3A");

        String url = "https://recreation.ubc.ca/pm-feed/?calendarname=Aquatic%20Centre&eventlocation=Null"
                + "&services=Null&ecolor=%23DD732D&closuresonly=N&teams&exclude&keywords&facilitytype"
                + "&start=" + startStr + "&end=" + endStr;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(response -> {
                    if (response.statusCode() / 100 != 2) {
                        throw new RuntimeException("UBC feed returned HTTP " + response.statusCode());
                    }
                    try {
                        return objectMapper.readValue(response.body(), SwimEvent[].class);
                    } catch (Exception e) {
                        throw new RuntimeException("Failed to parse UBC feed JSON: " + e.getMessage(), e);
                    }
                })
                .thenApply(List::of);
    }
}
