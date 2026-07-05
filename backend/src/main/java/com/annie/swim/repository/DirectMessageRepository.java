package com.annie.swim.repository;

import com.annie.swim.model.DirectMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface DirectMessageRepository extends JpaRepository<DirectMessage, Long> {

    /** Full two-way conversation between two users, oldest first. */
    @Query("select m from DirectMessage m where (m.senderId = :a and m.recipientId = :b) "
            + "or (m.senderId = :b and m.recipientId = :a) order by m.sentAt asc")
    List<DirectMessage> findConversation(@Param("a") Long a, @Param("b") Long b);

    /** Unread messages addressed to a user (for per-friend unread badges). */
    List<DirectMessage> findByRecipientIdAndReadAtIsNull(Long recipientId);
}
