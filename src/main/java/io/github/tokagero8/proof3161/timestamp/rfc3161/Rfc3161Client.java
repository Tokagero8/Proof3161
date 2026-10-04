package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import org.bouncycastle.tsp.TimeStampRequest;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Objects;

public final class Rfc3161Client {

    private final Rfc3161RequestFactory requestFactory;
    private final TsaHttpClient tsaHttpClient;

    public Rfc3161Client(
            Rfc3161RequestFactory requestFactory,
            TsaHttpClient tsaHttpClient
    ) {
        this.requestFactory = Objects.requireNonNull(requestFactory);
        this.tsaHttpClient = Objects.requireNonNull(tsaHttpClient);
    }

    public Exchange send(DocumentHash documentHash) {
        Objects.requireNonNull(documentHash, "documentHash cannot be null");

        TimeStampRequest request = requestFactory.create(documentHash);
        byte[] encodedRequest = encode(request);
        byte[] responseBytes = tsaHttpClient.send(encodedRequest);

        return new Exchange(request, responseBytes);
    }

    private byte[] encode(TimeStampRequest request) {
        try {
            return request.getEncoded();
        } catch (IOException exception) {
            throw new UncheckedIOException(
                    "Failed to encode timestamp request", exception
            );
        }
    }

    public record Exchange(
            TimeStampRequest request,
            byte[] responseBytes
    ) {
        public Exchange {
            Objects.requireNonNull(request, "request cannot be null");
            Objects.requireNonNull(responseBytes, "responseBytes cannot be null");
            responseBytes = responseBytes.clone();
        }

        @Override
        public byte[] responseBytes() {
            return responseBytes.clone();
        }
    }

}
