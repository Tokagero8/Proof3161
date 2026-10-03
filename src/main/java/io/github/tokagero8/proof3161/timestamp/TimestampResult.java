package io.github.tokagero8.proof3161.timestamp;

import java.time.Instant;

public record TimestampResult(
        Instant timestamp,
        byte[] token
) {

}
