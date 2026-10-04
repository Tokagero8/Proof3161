package io.github.tokagero8.proof3161.timestamp;

import java.time.Instant;
import java.util.Objects;

public record TimestampResult(
        Instant timestamp,
        byte[] token
) {
    public TimestampResult {
        Objects.requireNonNull(timestamp, "timestamp cannot be null");
        Objects.requireNonNull(token, "token cannot be null");

        if (token.length == 0) {
            throw new IllegalArgumentException("token cannot be empty");
        }

        token = token.clone();
    }

    @Override
    public byte[] token() {
        return token.clone();
    }

}
