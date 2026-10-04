package io.github.tokagero8.proof3161.timestamp.rfc3161;


import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import org.bouncycastle.asn1.cmp.PKIStatus;
import org.bouncycastle.tsp.TimeStampResponse;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("external")
@EnabledIfEnvironmentVariable(named = "TSA_URL", matches = "\\S+")
public class Rfc3161ExternalIntegrationTest {

    private final Rfc3161RequestFactory requestFactory =
            new Rfc3161RequestFactory();

    private final Rfc3161ResponseValidator responseValidator =
            new Rfc3161ResponseValidator();

    @Test
    void shouldReceiveTimestampTokenForSha256() throws Exception {
        byte[] document = "RFC 3161 integration test"
                .getBytes(StandardCharsets.UTF_8);

        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(document);

        var documentHash = new DocumentHash(
                HashAlgorithm.SHA256,
                HexFormat.of().formatHex(digest)
        );

        var request = requestFactory.create(documentHash);
        byte[] requestBytes = request.getEncoded();

        try (var httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build()) {

            var tsaClient = new JdkTsaHttpClient(
                    httpClient,
                    URI.create(System.getenv("TSA_URL")),
                    Duration.ofSeconds(20)
            );

            byte[] responseBytes = tsaClient.send(requestBytes);

            var result = responseValidator.validate(request, responseBytes);

            assertNotNull(result.timestamp(), "Result must contain generation time");
            assertNotNull(result.token(), "Result must contain an encoded token");
            assertTrue(result.token().length > 0, "Encoded token must not be empty");

            System.out.println("TSA generation time: " + result.timestamp());
        }
    }
}
