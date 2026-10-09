package io.github.tokagero8.proof3161.infrastructure.config;

import io.github.tokagero8.proof3161.timestamp.TimestampTokenVerifier;
import io.github.tokagero8.proof3161.timestamp.rfc3161.Rfc3161TimestampTokenVerifier;
import io.github.tokagero8.proof3161.timestamp.rfc3161.Rfc3161TokenValidator;
import io.github.tokagero8.proof3161.timestamp.rfc3161.TsaCertificateTrustValidator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.TrustAnchor;
import java.security.cert.X509Certificate;
import java.util.List;
import java.util.Set;

@Configuration(proxyBeanMethods = false)
public class VerificationConfiguration {

    @Bean
    Rfc3161TokenValidator rfc3161TokenValidator() {
        return new Rfc3161TokenValidator();
    }

    @Bean
    TsaCertificateTrustValidator tsaCertificateTrustValidator(
            @Value("${tsa.trusted-root-path}") String rootPath
    ) throws IOException, CertificateException {
        var factory = CertificateFactory.getInstance("X.509");

        X509Certificate trustedRoot;

        try (var input = Files.newInputStream(Path.of(rootPath))) {
            trustedRoot = (X509Certificate) factory.generateCertificate(input);
        }

        if (trustedRoot.getBasicConstraints() < 0) {
            throw new CertificateException(
                    "Configured TSA trust anchor must be a CA certificate"
            );
        }

        return new TsaCertificateTrustValidator(
                Set.of(new TrustAnchor(trustedRoot, null)),
                List.of()
        );
    }

    @Bean
    TimestampTokenVerifier timestampTokenVerifier(
            Rfc3161TokenValidator tokenValidator,
            TsaCertificateTrustValidator trustValidator
    ) {
        return new Rfc3161TimestampTokenVerifier(
                tokenValidator,
                trustValidator
        );
    }
}
