package io.github.tokagero8.proof3161.infrastructure.config;

import io.github.tokagero8.proof3161.proof.ProofRepository;
import io.github.tokagero8.proof3161.proof.ProofService;
import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ProofConfiguration {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    ProofService proofService(
            TimestampAuthority timestampAuthority,
            ProofRepository proofRepository,
            Clock clock
    ) {
        return new ProofService(
                timestampAuthority,
                proofRepository,
                clock
        );
    }
}
