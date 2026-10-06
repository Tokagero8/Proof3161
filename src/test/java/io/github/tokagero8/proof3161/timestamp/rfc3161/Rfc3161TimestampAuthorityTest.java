package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.timestamp.TimestampException;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.tsp.TSPException;
import org.bouncycastle.tsp.TimeStampRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class Rfc3161TimestampAuthorityTest {

    private final TsaHttpClient httpClient = mock(TsaHttpClient.class);

    private final Rfc3161ResponseValidator responseValidator =
            mock(Rfc3161ResponseValidator.class);

    private final Rfc3161TimestampAuthority authority =
            new Rfc3161TimestampAuthority(
                    new Rfc3161Client(
                            new Rfc3161RequestFactory(),
                            httpClient
                    ),
                    responseValidator
            );

    private final DocumentHash documentHash = new DocumentHash(
            HashAlgorithm.SHA256,
            "0123456789abcdef".repeat(4)
    );

    @Test
    void shouldSendRequestAndReturnValidatedResult() throws Exception {
        byte[] responseBytes = {1, 2, 3};

        var expectedResult = new TimestampResult(
                Instant.parse("2026-10-06T12:00:00Z"),
                new byte[]{4, 5, 6}
        );

        when(httpClient.send(any(byte[].class)))
                .thenReturn(responseBytes);

        when(responseValidator.validate(
                any(TimeStampRequest.class),
                any(byte[].class)
        )).thenReturn(expectedResult);

        var result = authority.timestamp(documentHash);

        assertSame(expectedResult, result);

        var sentBytes = ArgumentCaptor.forClass(byte[].class);
        var validatedRequest = ArgumentCaptor.forClass(TimeStampRequest.class);
        var validatedResponse = ArgumentCaptor.forClass(byte[].class);

        var order = inOrder(httpClient, responseValidator);
        order.verify(httpClient).send(sentBytes.capture());
        order.verify(responseValidator).validate(
                validatedRequest.capture(),
                validatedResponse.capture()
        );

        var sentRequest = new TimeStampRequest(sentBytes.getValue());

        assertEquals(
                NISTObjectIdentifiers.id_sha256,
                sentRequest.getMessageImprintAlgOID()
        );
        assertArrayEquals(
                HexFormat.of().parseHex(documentHash.value()),
                sentRequest.getMessageImprintDigest()
        );
        assertNotNull(sentRequest.getNonce());
        assertTrue(sentRequest.getCertReq());
        assertArrayEquals(
                sentBytes.getValue(),
                validatedRequest.getValue().getEncoded()
        );
        assertArrayEquals(responseBytes, validatedResponse.getValue());

        verifyNoMoreInteractions(httpClient, responseValidator);
    }

    @Test
    void shouldWrapValidationFailureAndPreserveCause() throws Exception {
        var failure = new TSPException("Token signature is invalid");

        when(httpClient.send(any(byte[].class)))
                .thenReturn(new byte[]{1, 2, 3});

        when(responseValidator.validate(
                any(TimeStampRequest.class),
                any(byte[].class)
        )).thenThrow(failure);

        var exception = assertThrows(
                TimestampException.class,
                () -> authority.timestamp(documentHash)
        );

        assertSame(failure, exception.getCause());
    }

    @Test
    void shouldPropagateTransportFailureWithoutValidating() {
        var failure = new UncheckedIOException(
                "TSA request failed",
                new IOException("Connection refused")
        );

        when(httpClient.send(any(byte[].class))).thenThrow(failure);

        var exception = assertThrows(
                UncheckedIOException.class,
                () -> authority.timestamp(documentHash)
        );

        assertSame(failure, exception);
        verifyNoMoreInteractions(responseValidator);
    }

    @Test
    void shouldRejectNullHashWithoutCallingDependencies() {
        assertThrows(
                NullPointerException.class,
                () -> authority.timestamp(null)
        );

        verifyNoMoreInteractions(httpClient, responseValidator);
    }
}
