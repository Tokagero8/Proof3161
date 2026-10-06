package io.github.tokagero8.proof3161.timestamp.rfc3161;


import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.TrustAnchor;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@Tag("external")
@EnabledIfEnvironmentVariable(named = "TSA_URL", matches = "\\S+")
public class Rfc3161ExternalIntegrationTest {

    @Test
    void shouldReceiveTimestampTokenForSha256() throws Exception {
        String rootPath = System.getenv("TSA_TRUSTED_ROOT_PATH");

        assertNotNull(
                rootPath,
                "Set TSA_TRUSTED_ROOT_PATH to an independently trusted root"
        );
        assertFalse(rootPath.isBlank(), "Trusted root path must not be blank");

        var trustedRoot = loadCertificate(Path.of(rootPath));

        assertTrue(
                trustedRoot.getBasicConstraints() >= 0,
                "Configured trust anchor must be a CA certificate"
        );

        var trustValidator = new TsaCertificateTrustValidator(
                Set.of(new TrustAnchor(trustedRoot, null)),
                List.of()
        );

        var responseValidator = new Rfc3161ResponseValidator(
                new Rfc3161TokenValidator(),
                trustValidator
        );

        byte[] document = "RFC 3161 integration test"
                .getBytes(StandardCharsets.UTF_8);

        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(document);

        var documentHash = new DocumentHash(
                HashAlgorithm.SHA256,
                HexFormat.of().formatHex(digest)
        );

        var request = new Rfc3161RequestFactory().create(documentHash);
        byte[] requestBytes = request.getEncoded();

        try (var httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build()) {

            var tsaClient = new JdkTsaHttpClient(
                    httpClient,
                    URI.create(System.getenv("TSA_URL")),
                    Duration.ofSeconds(20)
            );

            Instant sentAt = Instant.now();
            byte[] responseBytes = tsaClient.send(requestBytes);
            Instant receivedAt = Instant.now();

            var result = responseValidator.validate(request, responseBytes);

            assertNotNull(result.timestamp());
            assertTrue(result.token().length > 0);

            Duration allowedClockSkew = Duration.ofMinutes(2);

            assertFalse(
                    result.timestamp().isBefore(sentAt.minus(allowedClockSkew)),
                    "Timestamp is unexpectedly old"
            );
            assertFalse(result.timestamp().isAfter(receivedAt.plus(allowedClockSkew)),
                    "Timestamp is unexpectedly far in future"
            );

            System.out.println("TSA generation time: " + result.timestamp());
        }
    }

    @Test
    void shouldObtainValidatedTimestampThroughTimestampAuthority() throws Exception {
        String rootPath = System.getenv("TSA_TRUSTED_ROOT_PATH");

        assertNotNull(
                rootPath,
                "Set TSA_TRUSTED_ROOT_PATH to an independently trusted root"
        );
        assertFalse(
                rootPath.isBlank(),
                "Trusted root path must not be blank"
        );

        var trustedRoot = loadCertificate(Path.of(rootPath));

        assertTrue(
                trustedRoot.getBasicConstraints() >= 0,
                "Configured trust anchor must be a CA certificate"
        );

        var trustValidator = new TsaCertificateTrustValidator(
                Set.of(new TrustAnchor(trustedRoot, null)),
                List.of()
        );

        var responseValidator = new Rfc3161ResponseValidator(
                new Rfc3161TokenValidator(),
                trustValidator
        );

        byte[] document = "RFC 3161 integration test"
                .getBytes(StandardCharsets.UTF_8);

        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(document);

        var documentHash = new DocumentHash(
                HashAlgorithm.SHA256,
                HexFormat.of().formatHex(digest)
        );

        try (var httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build()) {

            var tsaHttpClient = new JdkTsaHttpClient(
                    httpClient,
                    URI.create(System.getenv("TSA_URL")),
                    Duration.ofSeconds(20)
            );

            var client = new Rfc3161Client(
                    new Rfc3161RequestFactory(),
                    tsaHttpClient
            );

            TimestampAuthority timestampAuthority =
                    new Rfc3161TimestampAuthority(
                            client,
                            responseValidator
                    );

            Instant startedAt = Instant.now();

            TimestampResult result =
                    timestampAuthority.timestamp(documentHash);

            Instant completedAt = Instant.now();

            assertNotNull(result);
            assertNotNull(result.timestamp());
            assertTrue(
                    result.token().length > 0,
                    "Result must contain an encoded timestamp token"
            );

            Duration allowedClockSkew = Duration.ofMinutes(2);

            assertFalse(
                    result.timestamp().isBefore(startedAt.minus(allowedClockSkew)),
                    "Timestamp is unexpectedly old"
            );
            assertFalse(
                    result.timestamp().isAfter(completedAt.plus(allowedClockSkew)),
                    "Timestamp is unexpectedly far in the future"
            );

            System.out.println(
                    "TSA generation time: " + result.timestamp()
            );
        }
    }

    private static X509Certificate loadCertificate(Path path)
            throws IOException, CertificateException {
        var factory = CertificateFactory.getInstance("X.509");

        try (var input = Files.newInputStream(path)) {
            return (X509Certificate) factory.generateCertificate(input);
        }
    }

}
