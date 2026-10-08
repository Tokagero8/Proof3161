package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record CreateProofRequest(
        @NotBlank(message = "documentHash is required")
        @Pattern(
                regexp = "[0-9a-fA-F]{64}",
                message = "documentHash must contain 64 hexadecimal characters"
        )
        String documentHash
) {

    public DocumentHash toDocumentHash() {
        return new DocumentHash(
                HashAlgorithm.SHA256,
                documentHash
        );
    }
}
