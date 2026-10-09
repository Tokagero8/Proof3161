package io.github.tokagero8.proof3161.verification;

import java.time.Instant;

public record VerificationResult(
        VerificationStatus status,
        String reason,
        Instant timestampAt
) {
}
