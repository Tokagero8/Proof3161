package io.github.tokagero8.proof3161.proof;

import java.util.Optional;
import java.util.UUID;

public interface ProofRepository {

    Proof save(Proof proof);

    Optional<Proof> findById(UUID id);
}
