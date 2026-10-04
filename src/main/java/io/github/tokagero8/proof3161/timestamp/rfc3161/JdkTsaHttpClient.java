package io.github.tokagero8.proof3161.timestamp.rfc3161;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Objects;

public final class JdkTsaHttpClient implements TsaHttpClient {

    private final HttpClient httpClient;
    private final URI tsaUri;
    private final Duration requestTimeout;

    public JdkTsaHttpClient(
            HttpClient httpClient,
            URI tsaUri,
            Duration requestTimeout
    ) {
        this.httpClient = Objects.requireNonNull(httpClient);
        this.tsaUri = Objects.requireNonNull(tsaUri);
        this.requestTimeout = Objects.requireNonNull(requestTimeout);
    }

    @Override
    public byte[] send(byte[] request) {
        Objects.requireNonNull(request, "request cannot be null");

        var httpRequest = HttpRequest.newBuilder(tsaUri)
                .timeout(requestTimeout)
                .header("Content-Type", "application/timestamp-query")
                .header("Accept", "application/timestamp-reply")
                .POST(HttpRequest.BodyPublishers.ofByteArray(request))
                .build();

        try {
            var response = httpClient.send(
                    httpRequest,
                    HttpResponse.BodyHandlers.ofByteArray()
            );

            if (response.statusCode() != 200) {
                throw new IOException(
                        "TSA returned HTTP status " + response.statusCode()
                );
            }

            return response.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "TSA HTTP request was interrupted", exception
            );
        } catch (IOException exception) {
            throw new UncheckedIOException(
                    "TSA HTTP request failed", exception
            );
        }
    }
}
