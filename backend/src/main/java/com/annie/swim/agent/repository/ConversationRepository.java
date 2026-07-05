package com.annie.swim.agent.repository;

import com.annie.swim.agent.model.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConversationRepository extends JpaRepository<Conversation, Long> {

    List<Conversation> findByUserIdOrderByCreatedAtDesc(Long userId);
}
