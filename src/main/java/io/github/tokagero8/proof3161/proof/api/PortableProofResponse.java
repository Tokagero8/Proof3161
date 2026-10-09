package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.proof.Proof;

import java.time.Instant;
import java.util.Base64;

public record PortableProofResponse(
        String version,
        String hashAlgorithm,
        String documentHash,
        Instant timestampAt,
        String timestampTokenBase64
) {

    public static PortableProofResponse fromDomain(Proof proof) {
        return new PortableProofResponse(
                "1",
                proof.documentHash().algorithm().name(),
                proof.documentHash().value(),
                proof.timestampResult().timestamp(),
                Base64.getEncoder().encodeToString(
                        proof.timestampResult().token()
                )
        );
    }
}
