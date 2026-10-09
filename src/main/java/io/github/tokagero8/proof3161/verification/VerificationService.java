package io.github.tokagero8.proof3161.verification;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.timestamp.TimestampTokenVerifier;
import io.github.tokagero8.proof3161.timestamp.TimestampVerificationException;
import io.github.tokagero8.proof3161.timestamp.VerifiedTimestamp;

import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Objects;

public final class VerificationService {

    private static final int MAX_BASE64_LENGTH = 87_384;

    private final TimestampTokenVerifier tokenVerifier;

    public VerificationService(TimestampTokenVerifier tokenVerifier){
        this.tokenVerifier = Objects.requireNonNull(tokenVerifier);
    }

    public VerificationResult verify(
            PortableProof portableProof,
            DocumentHash expectedDocumentHash
    ) {
        Objects.requireNonNull(portableProof, "portableProof cannot be null");
        Objects.requireNonNull(
                expectedDocumentHash,
                "expectedDocumentHash cannot be null"
        );

        if (!"1".equals(portableProof.version())) {
            throw new InvalidVerificationRequestException(
                    "Unsupported portable proof version"
            );
        }

        byte[] token = decodeToken(portableProof.timestampTokenBase64());

        VerifiedTimestamp verified;

        try {
            verified = tokenVerifier.verify(token);
        } catch (TimestampVerificationException exception) {
            var status = switch (exception.reason()) {
                case MALFORMED_TOKEN,
                     INVALID_TOKEN,
                     CERTIFICATE_REVOKED -> VerificationStatus.INVALID;

                case SIGNER_CERTIFICATE_UNAVAILABLE,
                     UNSUPPORTED_ALGORITHM,
                     TRUST_NOT_ESTABLISHED,
                     VERIFICATION_UNAVAILABLE -> VerificationStatus.INDETERMINATE;
            };

            return new VerificationResult(
                    status,
                    exception.reason().name(),
                    null
            );
        }

        if (!sameHash(expectedDocumentHash, verified.documentHash())) {
            return invalid("DOCUMENT_HASH_MISMATCH");
        }

        if (!sameHash(
                portableProof.documentHash(),
                verified.documentHash()
        )) {
            return invalid("RECEIPT_METADATA_MISMATCH");
        }

        if (!portableProof.timestampAt().equals(verified.timestamp())) {
            return invalid("RECEIPT_METADATA_MISMATCH");
        }

        return new VerificationResult(
                VerificationStatus.VALID,
                "VERIFIED",
                verified.timestamp()
        );
    }

    private static byte[] decodeToken(String encodedToken) {
        if (encodedToken.isBlank()
                || encodedToken.length() > MAX_BASE64_LENGTH) {
            throw new InvalidVerificationRequestException(
                    "Timestamp token is empty or too large"
            );
        }

        try {
            return Base64.getDecoder().decode(encodedToken);
        } catch (IllegalArgumentException exception) {
            throw new InvalidVerificationRequestException(
                    "timestampTokenBase64 must contain valid Base64"
            );
        }
    }

    private static boolean sameHash(
            DocumentHash first,
            DocumentHash second
    ) {
        return first.algorithm() == second.algorithm()
                && MessageDigest.isEqual(
                        HexFormat.of().parseHex(first.value()),
                        HexFormat.of().parseHex(second.value())
        );
    }

    private static VerificationResult invalid(String reason) {
        return new VerificationResult(
                VerificationStatus.INVALID,
                reason,
                null
        );
    }
}
