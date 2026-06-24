package com.annie.swim.controller;

import com.annie.swim.model.SwimRecord;
import com.annie.swim.repository.SwimRecordRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    public SwimRecordController(SwimRecordRepository repository) {
        this.repository = repository;
    }

    /** Full swim history, most recent first. */
    @GetMapping
    public List<SwimRecord> getAll() {
        return repository.findAllByOrderByStartedAtDesc();
    }

    /**
     * Starts a new swim: picks a character and a pool length (25 or 50m).
     * Assigns the first free lane (1-10) and creates the record.
     */
    @PostMapping
    public SwimRecord start(@RequestBody StartRequest request) {
        if (request.character() == null || request.character().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "character is required");
        }
        if (request.poolLength() != 25 && request.poolLength() != 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "poolLength must be 25 or 50");
        }

        int lane = assignLane();
        SwimRecord record = new SwimRecord(request.character(), request.poolLength(), lane);
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
    private int assignLane() {
        Set<Integer> occupied = repository.findByCompletedAtIsNull().stream()
                .map(SwimRecord::getLane)
                .collect(Collectors.toSet());

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

    public record StartRequest(String character, int poolLength) {
    }

    public record FinishRequest(Double distanceMeters) {
    }
}
