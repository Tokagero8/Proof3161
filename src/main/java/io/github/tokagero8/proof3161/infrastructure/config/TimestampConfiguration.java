package io.github.tokagero8.proof3161.infrastructure.config;

import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.TimestampTokenVerifier;
import io.github.tokagero8.proof3161.timestamp.rfc3161.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

@Configuration(proxyBeanMethods = false)
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
    Rfc3161ResponseValidator rfc3161ResponseValidator(
            TimestampTokenVerifier tokenVerifier
    ) {
        return new Rfc3161ResponseValidator(tokenVerifier);
    }

    @Bean
    TimestampAuthority timestampAuthority(
            Rfc3161Client client,
            Rfc3161ResponseValidator responseValidator
    ) {
        return new Rfc3161TimestampAuthority(
                client,
                responseValidator
        );
    }
}
