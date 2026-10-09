package io.github.tokagero8.proof3161.verification;

import io.github.tokagero8.proof3161.proof.DocumentHash;

import java.time.Instant;
import java.util.Objects;

public record PortableProof(
        String version,
        DocumentHash documentHash,
        Instant timestampAt,
        String timestampTokenBase64
) {

    public PortableProof {
        Objects.requireNonNull(version, "version cannot be null");
        Objects.requireNonNull(documentHash, "documentHash cannot be null");
        Objects.requireNonNull(timestampAt, "timestampAt cannot be null");
        Objects.requireNonNull(
                timestampTokenBase64,
                "timestampTokenBase64 cannot be null"
        );
    }
}
