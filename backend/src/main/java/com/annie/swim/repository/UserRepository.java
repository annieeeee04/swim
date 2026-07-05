package com.annie.swim.repository;

import com.annie.swim.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    /** Simple people-search over display name or email (add-friend box). */
    List<User> findTop10ByDisplayNameContainingIgnoreCaseOrEmailContainingIgnoreCase(
            String displayName, String email);

    Optional<User> findByProviderAndProviderId(String provider, String providerId);

    boolean existsByEmailIgnoreCase(String email);
}
