package com.annie.swim.repository;

import com.annie.swim.model.SwimInvite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SwimInviteRepository extends JpaRepository<SwimInvite, Long> {

    /** Every invite the user is part of (either side), newest first. */
    @Query("select i from SwimInvite i where i.inviterId = :userId or i.inviteeId = :userId "
            + "order by i.createdAt desc")
    List<SwimInvite> findAllFor(@Param("userId") Long userId);
}
