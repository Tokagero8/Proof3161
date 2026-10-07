package io.github.tokagero8.proof3161.infrastructure.config;

import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.rfc3161.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.TrustAnchor;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.List;
import java.util.Set;

@Configuration
public class TimestampConfiguration {

    @Bean(destroyMethod =  "close")
    HttpClient tsaJavaHttpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    @Bean
    TsaHttpClient tsaHttpClient (
            HttpClient tsaJavaHttpClient,
            @Value("${tsa.url}") URI tsaUri
    ) {
        return new JdkTsaHttpClient(
                tsaJavaHttpClient,
                tsaUri,
                Duration.ofSeconds(20)
        );
    }

    @Bean
    Rfc3161RequestFactory rfc3161RequestFactory() {
        return new Rfc3161RequestFactory();
    }

    @Bean
    Rfc3161Client rfc3161Client(
            Rfc3161RequestFactory requestFactory,
            TsaHttpClient tsaHttpClient
    ){
        return new Rfc3161Client(
                requestFactory,
                tsaHttpClient
        );
    }

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
    Rfc3161ResponseValidator rfc3161ResponseValidator(
            Rfc3161TokenValidator tokenValidator,
            TsaCertificateTrustValidator trustValidator
    ) {
        return new Rfc3161ResponseValidator(
                tokenValidator,
                trustValidator
        );
    }

    @Bean
    TimestampAuthority timestampAuthority(
            Rfc3161Client client,
            Rfc3161ResponseValidator validator
    ) {
        return new Rfc3161TimestampAuthority(
                client,
                validator
        );
    }
}
