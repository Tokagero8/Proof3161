package io.github.tokagero8.proof3161.proof;

import io.github.tokagero8.proof3161.timestamp.TimestampResult;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record Proof (
        UUID id,
        DocumentHash documentHash,
        TimestampResult timestampResult,
        Instant createdAt
) {
    public Proof {
        Objects.requireNonNull(id, "id cannot be null");
        Objects.requireNonNull(documentHash, "documentHash cannot be null");
        Objects.requireNonNull(timestampResult, "timestampResult cannot be null");
        Objects.requireNonNull(createdAt, "createAt cannot be null");
    }

}
