package io.github.tokagero8.proof3161.verification;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.timestamp.TimestampTokenVerifier;
import io.github.tokagero8.proof3161.timestamp.TimestampVerificationException;
import io.github.tokagero8.proof3161.timestamp.TimestampVerificationException.Reason;
import io.github.tokagero8.proof3161.timestamp.VerifiedTimestamp;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.Instant;
import java.util.Base64;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.Mockito.*;

public class VerificationServiceTest {

    private static final String HASH =
            "0123456789abcdef".repeat(4);

    private static final DocumentHash DOCUMENT_HASH =
            new DocumentHash(HashAlgorithm.SHA256, HASH);

    private static final Instant TIMESTAMP =
            Instant.parse("2026-10-08T12:00:00Z");

    private static final byte[] TOKEN = {1, 2, 3, 4};

    private static final String ENCODED_TOKEN =
            Base64.getEncoder().encodeToString(TOKEN);

    private final TimestampTokenVerifier tokenVerifier =
            mock(TimestampTokenVerifier.class);

    private final  VerificationService service =
            new VerificationService(tokenVerifier);

    @Test
    void shouldReturnValidForMatchingProof() throws Exception {
        stubValidToken();

        var result = service.verify(receipt(), DOCUMENT_HASH);

        assertEquals(
                new VerificationResult(
                        VerificationStatus.VALID,
                        "VERIFIED",
                        TIMESTAMP
                ),
                result
        );

        verify(tokenVerifier).verify(aryEq(TOKEN));
        verifyNoMoreInteractions(tokenVerifier);
    }

    @Test
    void shouldRejectModifiedDocumentHash() throws Exception {
        stubValidToken();

        var differentHash = new DocumentHash(
                HashAlgorithm.SHA256,
                "1" + HASH.substring(1)
        );

        var result = service.verify(receipt(), differentHash);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                "DOCUMENT_HASH_MISMATCH"
        );
    }

    @Test
    void shouldRejectModifiedReceiptHash() throws Exception {
        stubValidToken();

        var changedReceipt = new PortableProof(
                "1",
                new DocumentHash(
                        HashAlgorithm.SHA256,
                        "1" + HASH.substring(1)
                ),
                TIMESTAMP,
                ENCODED_TOKEN
        );

        var result = service.verify(changedReceipt, DOCUMENT_HASH);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                "RECEIPT_METADATA_MISMATCH"
        );
    }

    @Test
    void shouldRejectModifiedReceiptTimestamp() throws Exception {
        stubValidToken();

        var changedReceipt = new PortableProof(
                "1",
                DOCUMENT_HASH,
                TIMESTAMP.plusSeconds(1),
                ENCODED_TOKEN
        );

        var result = service.verify(changedReceipt, DOCUMENT_HASH);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                "RECEIPT_METADATA_MISMATCH"
        );
    }

    @Test
    void shouldAcceptEquivalentUppercaseHash() throws Exception {
        stubValidToken();

        var uppercaseHash = new DocumentHash(
                HashAlgorithm.SHA256,
                HASH.toUpperCase(Locale.ROOT)
        );

        var uppercaseReceipt = new PortableProof(
                "1",
                uppercaseHash,
                TIMESTAMP,
                ENCODED_TOKEN
        );

        var result = service.verify(uppercaseReceipt, uppercaseHash);

        assertEquals(VerificationStatus.VALID, result.status());
    }

    @Test
    void shouldRejectInvalidBase64BeforeVerifyingToken() {
        var invalidReceipt = new PortableProof(
                "1",
                DOCUMENT_HASH,
                TIMESTAMP,
                "%%%invalid-base64%%%"
        );

        assertThrows(
                InvalidVerificationRequestException.class,
                () -> service.verify(invalidReceipt, DOCUMENT_HASH)
        );

        verifyNoInteractions(tokenVerifier);
    }

    @Test
    void shouldRejectUnsupportedVersionBeforeVerifyingToken() {
        var unsupportedReceipt = new PortableProof(
                "2",
                DOCUMENT_HASH,
                TIMESTAMP,
                ENCODED_TOKEN
        );

        assertThrows(
                InvalidVerificationRequestException.class,
                () -> service.verify(unsupportedReceipt, DOCUMENT_HASH)
        );

        verifyNoInteractions(tokenVerifier);
    }

    @ParameterizedTest
    @EnumSource(
            value = Reason.class,
            names = {
                    "MALFORMED_TOKEN",
                    "INVALID_TOKEN",
                    "CERTIFICATE_REVOKED"
            }
    )
    void shouldMapDefiniteFailuresToInvalid(Reason reason) throws Exception {
        when(tokenVerifier.verify(aryEq(TOKEN)))
                .thenThrow(new TimestampVerificationException(
                        reason,
                        "Fixture verification failure"
                ));

        var result = service.verify(receipt(), DOCUMENT_HASH);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                reason.name()
        );
    }

    @ParameterizedTest
    @EnumSource(
            value = Reason.class,
            names = {
                    "SIGNER_CERTIFICATE_UNAVAILABLE",
                    "UNSUPPORTED_ALGORITHM",
                    "TRUST_NOT_ESTABLISHED",
                    "VERIFICATION_UNAVAILABLE"
            }
    )
    void shouldMapIncompleteChecksToIndeterminate(
            Reason reason
    ) throws Exception {
        when(tokenVerifier.verify(aryEq(TOKEN)))
                .thenThrow(new TimestampVerificationException(
                        reason,
                        "Fixture verification could not be completed"
                ));

        var result = service.verify(receipt(), DOCUMENT_HASH);

        assertFailure(
                result,
                VerificationStatus.INDETERMINATE,
                reason.name()
        );
    }

    private void stubValidToken() throws TimestampVerificationException {
        when(tokenVerifier.verify(aryEq(TOKEN)))
                .thenReturn(new VerifiedTimestamp(
                        DOCUMENT_HASH,
                        TIMESTAMP
                ));
    }

    private static PortableProof receipt() {
        return new PortableProof(
                "1",
                DOCUMENT_HASH,
                TIMESTAMP,
                ENCODED_TOKEN
        );
    }

    private static void assertFailure(
            VerificationResult result,
            VerificationStatus status,
            String reason
    ) {
        assertEquals(status, result.status());
        assertEquals(reason, result.reason());
        assertNull(result.timestampAt());
    }
}
