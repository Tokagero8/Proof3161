package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.proof.Proof;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public record ProofResponse(
        UUID id,
        String hashAlgorithm,
        String documentHash,
        Instant timestampAt,
        String timestampTokenBase64,
        Instant createdAt
) {

    public static ProofResponse fromDomain(Proof proof) {
        return new ProofResponse(
                proof.id(),
                proof.documentHash().algorithm().name(),
                proof.documentHash().value(),
                proof.timestampResult().timestamp(),
                Base64.getEncoder().encodeToString(
                        proof.timestampResult().token()
                ),
                proof.createdAt()
        );
    }
}
