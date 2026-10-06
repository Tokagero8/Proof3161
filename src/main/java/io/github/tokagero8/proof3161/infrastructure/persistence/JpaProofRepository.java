package io.github.tokagero8.proof3161.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface JpaProofRepository extends JpaRepository<ProofEntity, UUID> {
}
