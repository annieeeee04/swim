package com.annie.swim.controller;

import com.annie.swim.model.SwimRecord;
import com.annie.swim.model.User;
import com.annie.swim.repository.SwimRecordRepository;
import com.annie.swim.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/swim-records")
public class SwimRecordController {

    private static final int TOTAL_LANES = 10;

    private final SwimRecordRepository repository;
    private final AuthService auth;

    public SwimRecordController(SwimRecordRepository repository, AuthService auth) {
        this.repository = repository;
        this.auth = auth;
    }

    /** Full swim history, most recent first. */
    @GetMapping
    public List<SwimRecord> getAll() {
        return repository.findAllByOrderByStartedAtDesc();
    }

    /** Lanes (1-10) currently occupied by a swim that hasn't been completed yet. */
    @GetMapping("/occupied-lanes")
    public List<Integer> getOccupiedLanes() {
        return repository.findByCompletedAtIsNull().stream()
                .map(SwimRecord::getLane)
                .sorted()
                .collect(Collectors.toList());
    }

    /**
     * Starts a new swim: picks a character and a pool length (25 or 50m).
     * If the request specifies a lane, that lane is used (as long as it's free);
     * otherwise the first free lane (1-10) is assigned automatically.
     */
    @PostMapping
    public SwimRecord start(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authHeader,
            @RequestBody StartRequest request) {
        if (request.character() == null || request.character().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "character is required");
        }
        if (request.poolLength() != 25 && request.poolLength() != 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "poolLength must be 25 or 50");
        }

        Set<Integer> occupied = repository.findByCompletedAtIsNull().stream()
                .map(SwimRecord::getLane)
                .collect(Collectors.toSet());

        int lane;
        if (request.lane() != null) {
            if (request.lane() < 1 || request.lane() > TOTAL_LANES) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "lane must be between 1 and " + TOTAL_LANES);
            }
            if (occupied.contains(request.lane())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "lane " + request.lane() + " is already occupied");
            }
            lane = request.lane();
        } else {
            lane = assignLane(occupied);
        }

        SwimRecord record = new SwimRecord(request.character(), request.poolLength(), lane);
        User user = auth.optionalUser(authHeader);
        if (user != null) {
            record.setUserId(user.getId());
        }
        return repository.save(record);
    }

    /**
     * Finishes a swim by recording the distance the user actually swam, in meters.
     */
    @PatchMapping("/{id}")
    public SwimRecord finish(@PathVariable Long id, @RequestBody FinishRequest request) {
        SwimRecord record = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "swim record not found"));

        if (request.distanceMeters() == null || request.distanceMeters() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "distanceMeters must be a non-negative number");
        }

        record.setDistanceMeters(request.distanceMeters());
        record.setCompletedAt(Instant.now());
        return repository.save(record);
    }

    @ResponseStatus(HttpStatus.NO_CONTENT)
    @org.springframework.web.bind.annotation.DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        repository.deleteById(id);
    }

    /** Picks a free lane out of 1-10; if every lane is occupied, picks a random one anyway. */
    private int assignLane(Set<Integer> occupied) {
        List<Integer> free = new ArrayList<>();
        for (int lane = 1; lane <= TOTAL_LANES; lane++) {
            if (!occupied.contains(lane)) {
                free.add(lane);
            }
        }

        if (free.isEmpty()) {
            return ThreadLocalRandom.current().nextInt(1, TOTAL_LANES + 1);
        }
        return free.get(ThreadLocalRandom.current().nextInt(free.size()));
    }

    public record StartRequest(String character, int poolLength, Integer lane) {
    }

    public record FinishRequest(Double distanceMeters) {
    }
}
