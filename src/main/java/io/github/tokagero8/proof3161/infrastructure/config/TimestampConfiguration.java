package io.github.tokagero8.proof3161.infrastructure.config;

import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.rfc3161.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TimestampConfiguration {

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
