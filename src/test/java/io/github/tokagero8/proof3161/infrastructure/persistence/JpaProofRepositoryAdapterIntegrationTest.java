package io.github.tokagero8.proof3161.infrastructure.persistence;


import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.proof.Proof;
import io.github.tokagero8.proof3161.proof.ProofRepository;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.enabled=true",
        "spring.flyway.locations=classpath:db/migration"
})
@AutoConfigureTestDatabase(
        replace = AutoConfigureTestDatabase.Replace.NONE
)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import(JpaProofRepositoryAdapter.class)
@Testcontainers
public class JpaProofRepositoryAdapterIntegrationTest {

    private static final Instant TSA_TIMESTAMP =
            Instant.parse("2026-10-08T12:00:00.123456Z");

    private static final Instant CREATED_AT =
            Instant.parse("2026-10-08T12:00:05.123456Z");

    @Container
    static final PostgreSQLContainer postgres =
            new PostgreSQLContainer("postgres:18.3")
                    .withDatabaseName("proof3161_test")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "spring.datasource.url",
                postgres::getJdbcUrl
        );
        registry.add(
                "spring.datasource.username",
                postgres::getUsername
        );
        registry.add(
                "spring.datasource.password",
                postgres::getPassword
        );
    }

    @Autowired
    private ProofRepository proofRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void shouldSaveAndRetrieveProof() {
        var original = createProof(
                new byte[]{1, 2, 3, 4}
        );

        var saved = proofRepository.save(original);

        flushAndClear();

        var retried = proofRepository.findById(original.id())
                .orElseThrow();

        assertProofEquals(original, saved);
        assertProofEquals(original, retried);
    }

    @Test
    void shouldReturnEmptyUnknownId() {
        var result = proofRepository.findById(UUID.randomUUID());

        assertTrue(result.isEmpty());
    }

    @Test
    void shouldPreserveTimestampTokenBytes() {
        byte[] token = new byte[256];

        for (int i = 0; i < token.length; i++){
            token[i] = (byte) i;
        }

        var original = createProof(token);

        proofRepository.save(original);

        flushAndClear();

        var retrieved = proofRepository.findById(original.id())
                .orElseThrow();

        assertArrayEquals(
                token,
                retrieved.timestampResult().token()
        );
    }

    @Test
    void shouldRunFlywayMigration() {
        var migrationCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM flyway_schema_history
                WHERE version = '1'
                    AND script = 'V1__create_proofs.sql'
                    AND success = TRUE
                """,
                Long.class
        );

        assertEquals(Long.valueOf(1), migrationCount);

        var tableExists = jdbcTemplate.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                        AND table_name = 'proofs'
                )
                """,
                Boolean.class
        );

        assertEquals(Boolean.TRUE, tableExists);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    private static Proof createProof(byte[] token) {
        return new Proof(
                UUID.randomUUID(),
                new DocumentHash(
                        HashAlgorithm.SHA256,
                        "0123456789abcdef".repeat(4)
                ),
                new TimestampResult(
                        TSA_TIMESTAMP,
                        token
                ),
                CREATED_AT
        );
    }

    private static void assertProofEquals(
            Proof expected,
            Proof actual
    ) {
        assertAll(
                () -> assertEquals(
                        expected.id(),
                        actual.id()
                ),
                () -> assertEquals(
                        expected.documentHash(),
                        actual.documentHash()
                ),
                () -> assertEquals(
                        expected.timestampResult().timestamp(),
                        actual.timestampResult().timestamp()
                ),
                () -> assertArrayEquals(
                        expected.timestampResult().token(),
                        actual.timestampResult().token()
                ),
                () -> assertEquals(
                        expected.createdAt(),
                        actual.createdAt()
                )
        );
    }


}
