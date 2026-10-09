package io.github.tokagero8.proof3161.timestamp;

import io.github.tokagero8.proof3161.proof.DocumentHash;

import java.time.Instant;
import java.util.Objects;

public record VerifiedTimestamp(
        DocumentHash documentHash,
        Instant timestamp
) {

    public VerifiedTimestamp {
        Objects.requireNonNull(documentHash, "documentHash cannot be null");
        Objects.requireNonNull(timestamp, "timestamp cannot be null");
    }
}
