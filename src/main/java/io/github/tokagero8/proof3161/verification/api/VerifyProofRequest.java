package io.github.tokagero8.proof3161.verification.api;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.verification.PortableProof;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record VerifyProofRequest(
        @NotBlank
        @Pattern(regexp = "[0-9a-fA-F]{64}")
        String documentHash,

        @NotNull
        @Valid
        PortableProofInput portableProof
) {
    public DocumentHash toDocumentHash() {
        return new DocumentHash(
                HashAlgorithm.SHA256,
                documentHash
        );
    }

    public record PortableProofInput(
            @NotBlank
            @Pattern(
                    regexp = "1",
                    message = "Only portable proof version 1 is supported"
            )
            String version,

            @NotBlank
            @Pattern(
                    regexp = "SHA256",
                    message = "Only SHA256 is supported"
            )
            String hashAlgorithm,

            @NotBlank
            @Pattern(regexp = "[0-9a-fA-F]{64}")
            String documentHash,

            @NotNull
            Instant timestampAt,

            @NotBlank
            @Size(max = 87_384)
            String timestampTokenBase64
    ) {
        public PortableProof toDomain() {
            return new PortableProof(
                    version,
                    new DocumentHash(
                            HashAlgorithm.valueOf(hashAlgorithm),
                            documentHash
                    ),
                    timestampAt,
                    timestampTokenBase64
            );
        }
    }
}
