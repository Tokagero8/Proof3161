package io.github.tokagero8.proof3161.proof;

import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.TimestampException;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.AdditionalAnswers.returnsFirstArg;
import static org.mockito.Mockito.*;

public class ProofServiceTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-10-06T12:00:05Z");

    private static final Instant TSA_TIMESTAMP =
            Instant.parse("2026-10-06T12:00:00Z");

    private final TimestampAuthority timestampAuthority =
            mock(TimestampAuthority.class);

    private final ProofRepository proofRepository =
            mock(ProofRepository.class);

    private final Clock clock =
            Clock.fixed(CREATED_AT, ZoneOffset.UTC);

    private final ProofService proofService =
            new ProofService(
                    timestampAuthority,
                    proofRepository,
                    clock
            );

    private final DocumentHash documentHash = new DocumentHash(
            HashAlgorithm.SHA256,
            "0123456789abcdef".repeat(4)
    );

    @Test
    void shouldTimestampDocumentAndSaveProof() {
        byte[] token = {1, 2, 3};

        var timestampResult = new TimestampResult(TSA_TIMESTAMP, token);

        when(timestampAuthority.timestamp(documentHash))
                .thenReturn(timestampResult);

        when(proofRepository.save(any(Proof.class)))
                .thenAnswer(returnsFirstArg());

        var result = proofService.createProof(documentHash);

        var proofCaptor = ArgumentCaptor.forClass(Proof.class);

        var order = inOrder(timestampAuthority, proofRepository);

        order.verify(timestampAuthority).timestamp(documentHash);
        order.verify(proofRepository).save(proofCaptor.capture());

        var savedProof = proofCaptor.getValue();

        assertNotNull(savedProof.id());
        assertEquals(documentHash, savedProof.documentHash());
        assertEquals(
                TSA_TIMESTAMP,
                savedProof.timestampResult().timestamp()
        );
        assertArrayEquals(
                token,
                savedProof.timestampResult().token()
        );
        assertEquals(CREATED_AT, savedProof.createdAt());
        assertSame(savedProof, result);

        verifyNoMoreInteractions(timestampAuthority, proofRepository);
    }

    @Test
    void shouldPropagateTimestampingFailureWithoutSavingProof() {
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
        verifyNoInteractions(proofRepository);
    }

    @Test
    void shouldPropagatePersistenceFailure() {
        var timestampResult = new TimestampResult(
                TSA_TIMESTAMP,
                new byte[]{1, 2, 3}
        );

        var failure = new IllegalStateException(
                "Persistence failed"
        );

        when(timestampAuthority.timestamp(documentHash))
                .thenReturn(timestampResult);

        when(proofRepository.save(any(Proof.class)))
                .thenThrow(failure);

        var exception = assertThrows(
                IllegalStateException.class,
                () -> proofService.createProof(documentHash)
        );

        assertSame(failure, exception);

        var order = inOrder(timestampAuthority, proofRepository);

        order.verify(timestampAuthority).timestamp(documentHash);
        order.verify(proofRepository).save(any(Proof.class));

        verifyNoMoreInteractions(timestampAuthority, proofRepository);
    }

    @Test
    void shouldRejectNullHashWithoutCallingDependencies() {
        assertThrows(
                NullPointerException.class,
                () -> proofService.createProof(null)
        );

        verifyNoInteractions(timestampAuthority, proofRepository);
    }
}
