package io.github.tokagero8.proof3161.proof;

import java.util.Objects;

public record DocumentHash(
        HashAlgorithm algorithm,
        String value
) {
    public DocumentHash {
        Objects.requireNonNull(algorithm, "algorithm cannot be null");
        Objects.requireNonNull(value, "Value cannot be null");

        if (value.isBlank()) {
            throw new IllegalArgumentException(
                    "Hash value cannot be blank"
            );
        }

        if (algorithm == HashAlgorithm.SHA256 && value.length() != 64) {
            throw new IllegalArgumentException(
                    "SHA-256 hash must contain 64 hexadecimal characters"
            );
        }

        if (!value.matches("[0-9a-fA-F]{64}")) {
            throw new IllegalArgumentException(
                    "Invalid SHA-256 hash"
            );
        }
    }
}
