package com.annie.swim.repository;

import com.annie.swim.model.SwimRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface SwimRecordRepository extends JpaRepository<SwimRecord, Long> {

    List<SwimRecord> findAllByOrderByStartedAtDesc();

    /** Records belonging to one user, most recent first. */
    List<SwimRecord> findByUserIdOrderByStartedAtDesc(Long userId);

    /** Lanes currently occupied by a swim that hasn't been completed yet. */
    List<SwimRecord> findByCompletedAtIsNull();

    /** Completed swims since a cutoff instant — used to build today's leaderboard. */
    List<SwimRecord> findByCompletedAtIsNotNullAndCompletedAtAfter(Instant cutoff);
}
