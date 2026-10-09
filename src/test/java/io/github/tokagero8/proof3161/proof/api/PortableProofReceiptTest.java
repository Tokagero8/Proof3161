package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.proof.Proof;
import io.github.tokagero8.proof3161.proof.ProofService;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProofController.class)
@Import(ProofExceptionHandler.class)
public class PortableProofReceiptTest {

    private static final UUID PROOF_ID =
            UUID.fromString("18f56ac4-2499-416d-a145-902b97aed989");

    private static final String HASH =
            "0123456789abcdef".repeat(4);

    private static final Instant TIMESTAMP =
            Instant.parse("2026-10-08T12:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private ProofService proofService;

    @Test
    void shouldDownloadPortableProofReceipt() throws Exception {
        byte[] token = {1, 2, 3, 127, (byte) 128, (byte) 255} ;

        var proof = new Proof(
                PROOF_ID,
                new DocumentHash(HashAlgorithm.SHA256, HASH),
                new TimestampResult(TIMESTAMP, token),
                TIMESTAMP.plusSeconds(5)
        );

        when(proofService.findById(PROOF_ID))
                .thenReturn(Optional.of(proof));

        var response = mockMvc.perform(
                get("/api/v1/proofs/{id}/receipt", PROOF_ID)
        )
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_JSON
                ))
                .andExpect(header().exists(
                        HttpHeaders.CONTENT_DISPOSITION
                ))
                .andExpect(jsonPath("$.version").value("1"))
                .andExpect(jsonPath("$.hashAlgorithm").value("SHA256"))
                .andExpect(jsonPath("$.documentHash").value(HASH))
                .andExpect(jsonPath("$.timestampAt").value(
                        TIMESTAMP.toString()
                ))
                .andExpect(jsonPath("$.id").doesNotExist())
                .andExpect(jsonPath("$.createdAt").doesNotExist())
                .andReturn()
                .getResponse();

        var header = response.getHeader(HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(header);

        var disposition = ContentDisposition.parse(header);

        assertEquals("attachment", disposition.getType());
        assertEquals(
                "proof3161-" + PROOF_ID + ".proof.json",
                disposition.getFilename()
        );

        var body = objectMapper.readTree(response.getContentAsString());

        assertTrue(body.get("version").isTextual());

        byte[] downloadedToken = Base64.getDecoder().decode(
                body.get("timestampTokenBase64").asText()
        );

        assertArrayEquals(token, downloadedToken);

        verify(proofService).findById(PROOF_ID);
        verifyNoMoreInteractions(proofService);
    }

    @Test
    void shouldReturn404ForUnknownProof() throws Exception {
        when(proofService.findById(PROOF_ID))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/proofs/{id}/receipt", PROOF_ID))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_PROBLEM_JSON
                ))
                .andExpect(header().doesNotExist(
                        HttpHeaders.CONTENT_DISPOSITION
                ))
                .andExpect(jsonPath("$.status").value(404));

        verify(proofService).findById(PROOF_ID);
        verifyNoMoreInteractions(proofService);
    }
}
