package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.proof.Proof;
import io.github.tokagero8.proof3161.proof.ProofService;
import io.github.tokagero8.proof3161.timestamp.TimestampException;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProofController.class)
@Import(ProofExceptionHandler.class)
public class ProofControllerTest {

    private static final String HASH =
            "0123456789abcdef".repeat(4);

    private static final UUID PROOF_ID =
            UUID.fromString("18f56ac4-2499-416d-a145-902b97aed989");

    private static final Instant TSA_TIMESTAMP =
            Instant.parse("2026-10-08T12:00:00Z");

    private static final Instant CREATED_AT =
            Instant.parse("2026-10-08T12:00:05Z");

    private static final DocumentHash DOCUMENT_HASH =
            new DocumentHash(HashAlgorithm.SHA256, HASH);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProofService proofService;

    @Test
    void shouldCreateProof() throws Exception {
        when(proofService.createProof(DOCUMENT_HASH))
                .thenReturn(createProof());

        var result = mockMvc.perform(post("/api/v1/proofs")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validRequest()))
                .andExpect(status().isCreated())
                .andExpect(header().string(
                        "Location",
                        "http://localhost/api/v1/proofs/" + PROOF_ID
                ));

        assertProofResponse(result);

        verify(proofService).createProof(DOCUMENT_HASH);
        verifyNoMoreInteractions(proofService);
    }

    @Test
    void shouldGetProofById() throws Exception {
        when(proofService.findById(PROOF_ID))
                .thenReturn(Optional.of(createProof()));

        var result = mockMvc.perform(
                get("/api/v1/proofs/{id}", PROOF_ID)
            ).andExpect(status().isOk());

        assertProofResponse(result);

        verify(proofService).findById(PROOF_ID);
        verifyNoMoreInteractions(proofService);
    }

    @Test
    void shouldReturn404ForUnknownProof() throws Exception {
        when(proofService.findById(PROOF_ID))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/proofs/{id}", PROOF_ID))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_PROBLEM_JSON
                ))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("Proof not found"));

        verify(proofService).findById(PROOF_ID);
        verifyNoMoreInteractions(proofService);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            " ",
            "abc",
            "gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg"
    })
    void shouldRejectInvalidDocumentHash(String hash) throws Exception {
        mockMvc.perform(post("/api/v1/proofs")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                        """
                        {"documentHash": "%s"}
                        """.formatted(hash)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(proofService);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}",
            "{\"documentHash\": null}"
    })
    void shouldRejectMissingDocumentHash(String body) throws Exception {
        mockMvc.perform(post("/api/v1/proofs")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(proofService);
    }

    @Test
    void shouldReturn502WhenTimestampingFails() throws Exception {
        when(proofService.createProof(DOCUMENT_HASH))
                .thenThrow(new TimestampException(
                        "Timestamp validation failed",
                        new IllegalStateException("Invalid token")
                ));

        mockMvc.perform(post("/api/v1/proofs")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validRequest()))
                .andExpect(status().isBadGateway())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_PROBLEM_JSON
                ))
                .andExpect(jsonPath("$.status").value(502))
                .andExpect(jsonPath("$.title").value("Timestamping failed"))
                .andExpect(jsonPath("$.detail").value(
                        "Could not obtain a valid timestamp from the timestamp authority."
                ));

        verify(proofService).createProof(DOCUMENT_HASH);
        verifyNoMoreInteractions(proofService);
    }

    @Test
    void shouldRejectInvalidProofId() throws Exception {
        mockMvc.perform(get("/api/v1/proofs/not-a-uuid"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(proofService);
    }

    private static String validRequest() {
        return """
                {"documentHash": "%s"}
                """
                .formatted(HASH);
    }

    private static Proof createProof() {
        return new Proof(
                PROOF_ID,
                DOCUMENT_HASH,
                new TimestampResult(
                        TSA_TIMESTAMP,
                        new byte[]{1, 2, 3, 4}
                ),
                CREATED_AT
        );
    }

    private static void assertProofResponse(
            ResultActions result
    ) throws Exception {
        result
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_JSON
                ))
                .andExpect(jsonPath("$.id").value(PROOF_ID.toString()))
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
    }
}
