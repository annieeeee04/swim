package com.annie.swim.agent.skill;

import com.annie.swim.model.SwimEvent;
import com.annie.swim.service.UbcFeedService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Read-only search over the cached UBC Aquatic Centre Length Swim schedule.
 * Thin wrapper around {@link UbcFeedService} — exactly the same data the
 * Schedule tab shows, just filterable by natural-language-derived criteria.
 */
@Component
public class ScheduleSkill implements Skill {

    private final UbcFeedService feed;

    public ScheduleSkill(UbcFeedService feed) {
        this.feed = feed;
    }

    @Override
    public String name() {
        return "schedule_find_sessions";
    }

    @Override
    public String description() {
        return "Search the next 7 days of UBC Aquatic Centre drop-in Length Swim sessions. "
                + "Filter by pool length (25 or 50 meters), earliest start time of day, and date. "
                + "Returns each session's title, date, start/end time and facility.";
    }

    @Override
    public Map<String, Object> parameterSchema() {
        return Map.of(
                "type", "object",
                "properties", Map.of(
                        "poolLength", Map.of(
                                "type", "integer",
                                "enum", List.of(25, 50),
                                "description", "Only sessions in this pool length (meters)."),
                        "after", Map.of(
                                "type", "string",
                                "description", "Earliest start time of day, 24h HH:mm (e.g. \"18:00\")."),
                        "date", Map.of(
                                "type", "string",
                                "description", "Only sessions on this date, YYYY-MM-DD."),
                        "limit", Map.of(
                                "type", "integer",
                                "description", "Max sessions to return (default 10).")),
                "required", List.of());
    }

    @Override
    public SkillResult execute(SkillContext ctx, JsonNode args) {
        Integer poolLength = args.hasNonNull("poolLength") ? args.get("poolLength").asInt() : null;
        LocalTime after = args.hasNonNull("after") ? LocalTime.parse(args.get("after").asText()) : null;
        LocalDate date = args.hasNonNull("date") ? LocalDate.parse(args.get("date").asText()) : null;
        int limit = args.hasNonNull("limit") ? Math.min(args.get("limit").asInt(), 25) : 10;

        List<Map<String, Object>> matches = new ArrayList<>();
        for (SwimEvent ev : feed.getSchedule()) {
            LocalDateTime start = parse(ev.getStart());
            LocalDateTime end = parse(ev.getEnd());
            if (start == null) {
                continue;
            }
            if (poolLength != null && ev.isFiftyMeter() != (poolLength == 50)) {
                continue;
            }
            if (after != null && start.toLocalTime().isBefore(after)) {
                continue;
            }
            if (date != null && !start.toLocalDate().equals(date)) {
                continue;
            }
            matches.add(Map.of(
                    "title", ev.getTitle() == null ? "" : ev.getTitle(),
                    "date", start.toLocalDate().toString(),
                    "day", start.getDayOfWeek().toString(),
                    "start", start.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")),
                    "end", end == null ? "" : end.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")),
                    "poolLength", ev.isFiftyMeter() ? 50 : 25,
                    "facility", ev.getFacilityName() == null ? "" : ev.getFacilityName()));
            if (matches.size() >= limit) {
                break;
            }
        }

        String summary = matches.isEmpty()
                ? "No matching Length Swim sessions in the next 7 days."
                : "Found " + matches.size() + " matching session" + (matches.size() == 1 ? "" : "s") + ".";
        return SkillResult.of(summary, Map.of("sessions", matches));
    }

    /** The UBC feed serves local ISO-ish datetimes; be lenient about the exact shape. */
    private LocalDateTime parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(raw.trim().replace(' ', 'T'));
        } catch (Exception e) {
            return null;
        }
    }
}
