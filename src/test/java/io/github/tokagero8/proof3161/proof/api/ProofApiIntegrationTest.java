package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.infrastructure.config.ProofConfiguration;
import io.github.tokagero8.proof3161.infrastructure.persistence.JpaProofRepository;
import io.github.tokagero8.proof3161.infrastructure.persistence.ProofEntity;
import io.github.tokagero8.proof3161.infrastructure.persistence.JpaProofRepositoryAdapter;
import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.proof.ProofRepository;
import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.TimestampException;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(
        classes = {
                ProofConfiguration.class,
                ProofApiIntegrationTest.PersistenceConfiguration.class
        },
        properties = {
                "spring.jpa.hibernate.ddl-auto=validate",
                "spring.jpa.open-in-view=false",
                "spring.flyway.enabled=true",
                "spring.flyway.locations=classpath:db/migration"
        }
)
@AutoConfigureMockMvc
@Testcontainers
public class ProofApiIntegrationTest {

    private static final String HASH =
            "0123456789abcdef".repeat(4);

    private static final Instant TSA_TIMESTAMP =
            Instant.parse("2026-10-08T12:00:00Z");

    private static final Instant CREATED_AT =
            Instant.parse("2026-10-08T12:00:05Z");

    private static final DocumentHash DOCUMENT_HASH =
            new DocumentHash(HashAlgorithm.SHA256, HASH);

    @Container
    static final PostgreSQLContainer postgres =
            new PostgreSQLContainer("postgres:18.3")
                    .withDatabaseName("proof3161_api_test")
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
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProofRepository proofRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private TimestampAuthority timestampAuthority;

    @MockitoBean(enforceOverride = true)
    private Clock clock;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM proofs");

        when(clock.instant()).thenReturn(CREATED_AT);
    }

    @Test
    void shouldCreatePersistAndRetrieveProof() throws Exception {
        byte[] token = {1, 2, 3, 4};

        when(timestampAuthority.timestamp(DOCUMENT_HASH))
                .thenReturn(new TimestampResult(
                        TSA_TIMESTAMP,
                        token
                ));

        var response = mockMvc.perform(post("/api/v1/proofs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_JSON
                ))
                .andExpect(jsonPath("$.hashAlgorithm").value("SHA256"))
                .andExpect(jsonPath("$.documentHash").value(HASH))
                .andExpect(jsonPath("$.timestampAt").value(
                        TSA_TIMESTAMP.toString()
                ))
                .andExpect(jsonPath("$.timestampTokenBase64").value(
                        "AQIDBA=="
                ))
                .andExpect(jsonPath("$.createdAt").value(
                        CREATED_AT.toString()
                ))
                .andReturn()
                .getResponse();

        var body = objectMapper.readTree(response.getContentAsString());
        var id = UUID.fromString(body.get("id").asText());

        assertEquals(
                "http://localhost/api/v1/proofs/" + id,
                response.getHeader("Location")
        );

        var rowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM proofs WHERE id = ?",
                Long.class,
                id
        );

        assertEquals(Long.valueOf(1), rowCount);

        var stored = proofRepository.findById(id).orElseThrow();

        assertEquals(id, stored.id());
        assertEquals(DOCUMENT_HASH, stored.documentHash());
        assertEquals(TSA_TIMESTAMP, stored.timestampResult().timestamp());
        assertArrayEquals(token, stored.timestampResult().token());
        assertEquals(CREATED_AT, stored.createdAt());

        mockMvc.perform(get("/api/v1/proofs/{id}", id))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_JSON
                ))
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.hashAlgorithm").value("SHA256"))
                .andExpect(jsonPath("$.documentHash").value(HASH))
                .andExpect(jsonPath("$.timestampAt").value(
                        TSA_TIMESTAMP.toString()
                ))
                .andExpect(jsonPath("$.timestampTokenBase64").value(
                        "AQIDBA=="
                ))
                .andExpect(jsonPath("$.createdAt").value(
                        CREATED_AT.toString()
                ));

        verify(timestampAuthority).timestamp(DOCUMENT_HASH);
        verifyNoMoreInteractions(timestampAuthority);
    }

    @Test
    void shouldNotPersistProofWhenTimestampingFails() throws Exception {
        when(timestampAuthority.timestamp(DOCUMENT_HASH))
                .thenThrow(new TimestampException(
                        "Timestamping failed",
                        new IllegalStateException("Invalid token")
                ));

        mockMvc.perform(post("/api/v1/proofs")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validRequest()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.status").value(502));

        var rowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM proofs",
                Long.class
        );

        assertEquals(Long.valueOf(0), rowCount);

        verify(timestampAuthority).timestamp(DOCUMENT_HASH);
        verifyNoMoreInteractions(timestampAuthority);
    }

    private static String validRequest() {
        return """
                {"documentHash": "%s"}
                """
                .formatted(HASH);
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableAutoConfiguration
    @EntityScan(basePackageClasses = ProofEntity.class)
    @EnableJpaRepositories(basePackageClasses = JpaProofRepository.class)
    @Import({
            JpaProofRepositoryAdapter.class,
            ProofController.class,
            ProofExceptionHandler.class
    })
    static class PersistenceConfiguration {

    }
}
