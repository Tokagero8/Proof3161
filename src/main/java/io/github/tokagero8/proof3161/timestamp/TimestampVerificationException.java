package io.github.tokagero8.proof3161.timestamp;

import java.security.GeneralSecurityException;
import java.util.Objects;

public final class TimestampVerificationException extends GeneralSecurityException {

    public enum Reason {
        MALFORMED_TOKEN,
        INVALID_TOKEN,
        CERTIFICATE_REVOKED,
        SIGNER_CERTIFICATE_UNAVAILABLE,
        UNSUPPORTED_ALGORITHM,
        TRUST_NOT_ESTABLISHED,
        VERIFICATION_UNAVAILABLE
    }

    private final Reason reason;

    public TimestampVerificationException(
            Reason reason,
            String message
    ) {
        super(message);
        this.reason = Objects.requireNonNull(reason);
    }

    public TimestampVerificationException(
            Reason reason,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.reason = Objects.requireNonNull(reason);
    }

    public Reason reason() {
        return reason;
    }
}
