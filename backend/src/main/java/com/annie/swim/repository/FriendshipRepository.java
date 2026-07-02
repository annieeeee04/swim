package com.annie.swim.repository;

import com.annie.swim.model.Friendship;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    /** The edge between two users regardless of who asked whom. */
    @Query("select f from Friendship f where (f.requesterId = :a and f.addresseeId = :b) "
            + "or (f.requesterId = :b and f.addresseeId = :a)")
    Optional<Friendship> findBetween(@Param("a") Long a, @Param("b") Long b);

    /** All accepted friendships involving a user. */
    @Query("select f from Friendship f where f.status = 'ACCEPTED' "
            + "and (f.requesterId = :userId or f.addresseeId = :userId)")
    List<Friendship> findAcceptedFor(@Param("userId") Long userId);

    /** Incoming, still-pending friend requests. */
    List<Friendship> findByAddresseeIdAndStatusOrderByCreatedAtDesc(Long addresseeId, String status);

    /** Outgoing, still-pending friend requests. */
    List<Friendship> findByRequesterIdAndStatusOrderByCreatedAtDesc(Long requesterId, String status);
}
