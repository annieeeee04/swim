package com.annie.swim.controller;

import com.annie.swim.model.SwimRecord;
import com.annie.swim.model.User;
import com.annie.swim.repository.SwimRecordRepository;
import com.annie.swim.repository.UserRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * "Today's swimmers" ranking. Combines real, user-attributed swims logged since
 * midnight (America/Vancouver) with a set of seeded demo swimmers, so the
 * podium always looks alive. Sorted by total distance; ties broken by swim count.
 */
@RestController
@RequestMapping("/api/leaderboard")
public class LeaderboardController {

    private static final ZoneId ZONE = ZoneId.of("America/Vancouver");

    private final SwimRecordRepository records;
    private final UserRepository users;

    public LeaderboardController(SwimRecordRepository records, UserRepository users) {
        this.records = records;
        this.users = users;
    }

    @GetMapping("/today")
    public List<Entry> today() {
        var cutoff = LocalDate.now(ZONE).atStartOfDay(ZONE).toInstant();

        // Accumulate real swims grouped by their owner.
        Map<Long, Acc> byUser = new LinkedHashMap<>();
        for (SwimRecord r : records.findByCompletedAtIsNotNullAndCompletedAtAfter(cutoff)) {
            if (r.getUserId() == null || r.getDistanceMeters() == null) {
                continue;
            }
            Acc acc = byUser.computeIfAbsent(r.getUserId(), k -> new Acc());
            acc.total += r.getDistanceMeters();
            acc.swims += 1;
            acc.best = Math.max(acc.best, r.getDistanceMeters());
        }

        List<Entry> entries = new ArrayList<>();
        for (var e : byUser.entrySet()) {
            User u = users.findById(e.getKey()).orElse(null);
            if (u == null) {
                continue;
            }
            Acc a = e.getValue();
            entries.add(new Entry(0, u.getId(), u.getDisplayName(), u.getPhotoUrl(),
                    orDefault(u.getAvatarSkin(), "#f3c89e"),
                    orDefault(u.getAvatarSuit(), "#ec4899"),
                    orDefault(u.getAvatarCap(), "#a855f7"),
                    a.total, a.swims, a.best, false));
        }

        entries.addAll(seededDemo());

        entries.sort(Comparator
                .comparingDouble(Entry::totalMeters).reversed()
                .thenComparing(Comparator.comparingInt(Entry::swims).reversed()));

        // Assign 1-based ranks.
        List<Entry> ranked = new ArrayList<>(entries.size());
        for (int i = 0; i < entries.size(); i++) {
            ranked.add(entries.get(i).withRank(i + 1));
        }
        return ranked;
    }

    /** Stable-per-day demo swimmers so the board is never empty. */
    private List<Entry> seededDemo() {
        int day = LocalDate.now(ZONE).getDayOfYear();
        Object[][] demos = {
                {"Marlin Max", "#e8b58a", "#0ea5e9", "#0369a1", 3200},
                {"Coral Kai", "#f1c9a5", "#ec4899", "#be185d", 2850},
                {"Splash Sam", "#e7b48a", "#22c55e", "#15803d", 2400},
                {"Wave Wren", "#f3c89e", "#a855f7", "#6d28d9", 2100},
                {"Tide Tara", "#edd1b3", "#f59e0b", "#b45309", 1800},
                {"Finn Frost", "#eac29c", "#14b8a6", "#0f766e", 1500},
                {"Dory Dee", "#f4cda3", "#f43f5e", "#9f1239", 1200},
        };
        List<Entry> out = new ArrayList<>();
        for (int i = 0; i < demos.length; i++) {
            Object[] d = demos[i];
            int base = (int) d[4];
            // small deterministic daily wobble so ranks shuffle a bit each day
            double total = base + ((day * 37 + i * 53) % 400) - 200;
            int swims = 2 + ((day + i) % 4);
            out.add(new Entry(0, null, (String) d[0], null,
                    (String) d[1], (String) d[2], (String) d[3],
                    Math.max(200, total), swims, Math.max(200, total) / swims, true));
        }
        return out;
    }

    private static String orDefault(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static final class Acc {
        double total = 0;
        int swims = 0;
        double best = 0;
    }

    public record Entry(
            int rank,
            Long userId,
            String displayName,
            String photoUrl,
            String avatarSkin,
            String avatarSuit,
            String avatarCap,
            double totalMeters,
            int swims,
            double best,
            boolean demo) {

        Entry withRank(int newRank) {
            return new Entry(newRank, userId, displayName, photoUrl, avatarSkin, avatarSuit,
                    avatarCap, totalMeters, swims, best, demo);
        }
    }
}
