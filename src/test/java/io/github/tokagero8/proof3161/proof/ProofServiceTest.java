package io.github.tokagero8.proof3161.proof;

import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.TimestampException;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

public class ProofServiceTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-10-06T12:00:05Z");

    private static final Instant TSA_TIMESTAMP =
            Instant.parse("2026-10-06T12:00:00Z");

    private final TimestampAuthority timestampAuthority =
            mock(TimestampAuthority.class);

    private final Clock clock =
            Clock.fixed(CREATED_AT, ZoneOffset.UTC);

    private final ProofService proofService =
            new ProofService(timestampAuthority, clock);

    private final DocumentHash documentHash = new DocumentHash(
            HashAlgorithm.SHA256,
            "0123456789abcdef".repeat(4)
    );

    @Test
    void shouldCreateProofWithTimestampResultAndApplicationTime() {
        byte[] token = {1, 2, 3};

        var timestampResult = new TimestampResult(TSA_TIMESTAMP, token);

        when(timestampAuthority.timestamp(documentHash))
                .thenReturn(timestampResult);

        var proof = proofService.createProof(documentHash);

        assertNotNull(proof.id());
        assertEquals(documentHash, proof.documentHash());
        assertEquals(TSA_TIMESTAMP, proof.timestampResult().timestamp());
        assertArrayEquals(token, proof.timestampResult().token());
        assertEquals(CREATED_AT, proof.createdAt());

        verify(timestampAuthority).timestamp(documentHash);
        verifyNoMoreInteractions(timestampAuthority);
    }

    @Test
    void shouldPropagateTimestampingFailure() {
        var failure = new TimestampException(
                "Failed to validate TSA response",
                new IllegalStateException("Invalid signature")
        );

        when(timestampAuthority.timestamp(documentHash))
                .thenThrow(failure);

        var exception = assertThrows(
                TimestampException.class,
                () -> proofService.createProof(documentHash)
        );

        assertSame(failure, exception);
        verify(timestampAuthority).timestamp(documentHash);
        verifyNoMoreInteractions(timestampAuthority);
    }

    @Test
    void shouldRejectNullHashWithoutCallingTimestampAuthority() {
        assertThrows(
                NullPointerException.class,
                () -> proofService.createProof(null)
        );

        verifyNoInteractions(timestampAuthority);
    }
}
