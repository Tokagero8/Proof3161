package io.github.tokagero8.proof3161.verification.api;

import io.github.tokagero8.proof3161.verification.VerificationResult;
import io.github.tokagero8.proof3161.verification.VerificationStatus;

import java.time.Instant;

public record VerificationResponse(
        VerificationStatus status,
        String reason,
        Instant timestampAt
) {

    public static VerificationResponse fromDomain(
            VerificationResult result
    ) {
        return new VerificationResponse(
                result.status(),
                result.reason(),
                result.timestampAt()
        );
    }
}
