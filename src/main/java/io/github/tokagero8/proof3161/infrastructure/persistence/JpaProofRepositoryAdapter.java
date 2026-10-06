package io.github.tokagero8.proof3161.infrastructure.persistence;

import io.github.tokagero8.proof3161.proof.Proof;
import io.github.tokagero8.proof3161.proof.ProofRepository;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaProofRepositoryAdapter implements ProofRepository {

    private final JpaProofRepository jpaProofRepository;

    public JpaProofRepositoryAdapter(
            JpaProofRepository jpaProofRepository
    ) {
        this.jpaProofRepository = Objects.requireNonNull(
                jpaProofRepository,
                "jpaProofRepository cannot be null"
        );
    }

    @Override
    @Transactional
    public Proof save(Proof proof) {
        Objects.requireNonNull(proof, "proof cannot be null");

        var entity = ProofEntity.fromDomain(proof);
        var savedEntity = jpaProofRepository.save(entity);

        return savedEntity.toDomain();
    }

    @Override
    public Optional<Proof> findById(UUID id) {
        Objects.requireNonNull(id, "id cannot be null");

        return jpaProofRepository.findById(id)
                .map(ProofEntity::toDomain);
    }
}
