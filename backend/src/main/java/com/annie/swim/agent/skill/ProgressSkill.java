package com.annie.swim.agent.skill;

import com.annie.swim.model.SwimRecord;
import com.annie.swim.repository.SwimRecordRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Summarizes the signed-in user's own swim history: totals, best swim,
 * weekly volume and streaks. Thin wrapper over {@link SwimRecordRepository}
 * — same data as the "My Records" tab, pre-aggregated for the model.
 */
@Component
public class ProgressSkill implements Skill {

    private static final ZoneId VANCOUVER = ZoneId.of("America/Vancouver");

    private final SwimRecordRepository records;

    public ProgressSkill(SwimRecordRepository records) {
        this.records = records;
    }

    @Override
    public String name() {
        return "progress_summary";
    }

    @Override
    public String description() {
        return "Summarize the current user's completed swims: total distance, swim count, "
                + "best single swim, current daily streak, and a per-week volume breakdown. "
                + "Optionally limit to the last N days.";
    }

    @Override
    public Map<String, Object> parameterSchema() {
        return Map.of(
                "type", "object",
                "properties", Map.of(
                        "days", Map.of(
                                "type", "integer",
                                "description", "Only include swims from the last N days (default: all history).")),
                "required", List.of());
    }

    @Override
    public SkillResult execute(SkillContext ctx, JsonNode args) {
        if (ctx.user() == null) {
            return SkillResult.of("No signed-in user; no swim history available.", Map.of());
        }
        Integer days = args.hasNonNull("days") ? args.get("days").asInt() : null;
        Instant cutoff = days == null ? Instant.EPOCH : Instant.now().minus(days, ChronoUnit.DAYS);

        double total = 0;
        int count = 0;
        double best = 0;
        TreeSet<LocalDate> swimDays = new TreeSet<>();
        Map<LocalDate, Double> weekly = new LinkedHashMap<>();

        for (SwimRecord r : records.findByUserIdOrderByStartedAtDesc(ctx.user().getId())) {
            if (r.getCompletedAt() == null || r.getDistanceMeters() == null) {
                continue;
            }
            if (r.getCompletedAt().isBefore(cutoff)) {
                continue;
            }
            double meters = r.getDistanceMeters();
            total += meters;
            count++;
            best = Math.max(best, meters);
            LocalDate day = r.getCompletedAt().atZone(VANCOUVER).toLocalDate();
            swimDays.add(day);
            LocalDate weekStart = day.minusDays(day.getDayOfWeek().getValue() - 1L);
            weekly.merge(weekStart, meters, Double::sum);
        }

        // Current streak: consecutive days ending today or yesterday.
        int streak = 0;
        LocalDate cursor = LocalDate.now(VANCOUVER);
        if (!swimDays.contains(cursor)) {
            cursor = cursor.minusDays(1);
        }
        while (swimDays.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }

        List<Map<String, Object>> weeks = new ArrayList<>();
        weekly.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(e -> weeks.add(Map.of(
                        "weekOf", e.getKey().toString(),
                        "meters", Math.round(e.getValue()))));

        Map<String, Object> data = Map.of(
                "totalMeters", Math.round(total),
                "swimCount", count,
                "bestSwimMeters", Math.round(best),
                "avgPerSwimMeters", count == 0 ? 0 : Math.round(total / count),
                "currentStreakDays", streak,
                "weeklyVolume", weeks);

        String summary = count == 0
                ? "No completed swims" + (days == null ? " yet." : " in the last " + days + " days.")
                : count + " swims, " + Math.round(total) + "m total, best " + Math.round(best) + "m.";
        return SkillResult.of(summary, data);
    }
}
