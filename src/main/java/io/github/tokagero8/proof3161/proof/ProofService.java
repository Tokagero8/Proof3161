package io.github.tokagero8.proof3161.proof;

import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class ProofService {

    private final TimestampAuthority timestampAuthority;
    private final Clock clock;

    public ProofService(
            TimestampAuthority timestampAuthority,
            Clock clock
    ) {
        this.timestampAuthority = Objects.requireNonNull(
                timestampAuthority,
                "timestampAuthority cannot be null"
        );
        this.clock = Objects.requireNonNull(clock, "clock cannot be null");
    }

    public Proof createProof(DocumentHash documentHash) {
        Objects.requireNonNull(documentHash, "documentHash cannot be null");

        var timestampResult = timestampAuthority.timestamp(documentHash);

        return new Proof(
                UUID.randomUUID(),
                documentHash,
                timestampResult,
                Instant.now(clock)
        );
    }
}
