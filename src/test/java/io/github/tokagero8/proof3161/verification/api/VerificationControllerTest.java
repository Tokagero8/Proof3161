package io.github.tokagero8.proof3161.verification.api;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.verification.InvalidVerificationRequestException;
import io.github.tokagero8.proof3161.verification.PortableProof;
import io.github.tokagero8.proof3161.verification.VerificationResult;
import io.github.tokagero8.proof3161.verification.VerificationService;
import io.github.tokagero8.proof3161.verification.VerificationStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;



@WebMvcTest(VerificationController.class)
@Import(VerificationExceptionHandler.class)
public class VerificationControllerTest {

    private static final String HASH =
            "0123456789abcdef".repeat(4);

    private static final Instant TIMESTAMP =
            Instant.parse("2026-10-08T12:00:00Z");

    private static final String ENCODED_TOKEN = "AQIDBA==";

    private static final DocumentHash DOCUMENT_HASH =
            new DocumentHash(HashAlgorithm.SHA256, HASH);

    private static final PortableProof PORTABLE_PROOF =
            new PortableProof(
                    "1",
                    DOCUMENT_HASH,
                    TIMESTAMP,
                    ENCODED_TOKEN
            );

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private VerificationService verificationService;

    @Test
    void shouldVerifyValidRequest() throws Exception {
        when(verificationService.verify(PORTABLE_PROOF, DOCUMENT_HASH))
                .thenReturn(new VerificationResult(
                        VerificationStatus.VALID,
                        "VERIFIED",
                        TIMESTAMP
                ));

        mockMvc.perform(post("/api/v1/verifications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request())))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_JSON
                ))
                .andExpect(jsonPath("$.status").value("VALID"))
                .andExpect(jsonPath("$.reason").value("VERIFIED"))
                .andExpect(jsonPath("$.timestampAt").value(
                        TIMESTAMP.toString()
                ));

        verify(verificationService).verify(PORTABLE_PROOF, DOCUMENT_HASH);
        verifyNoMoreInteractions(verificationService);
    }

    @Test
    void shouldReturnInvalidResultWithHttp200() throws Exception {
        when(verificationService.verify(PORTABLE_PROOF, DOCUMENT_HASH))
                .thenReturn(new VerificationResult(
                        VerificationStatus.INVALID,
                        "DOCUMENT_HASH_MISMATCH",
                        null
                ));

        mockMvc.perform(post("/api/v1/verifications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INVALID"))
                .andExpect(jsonPath("$.reason").value(
                        "DOCUMENT_HASH_MISMATCH"
                ));
    }

    @Test
    void shouldRejectInvalidDocumentHash() throws Exception {
        var body = request();
        body.put("documentHash", "g".repeat(64));

        assertBadRequest(body);

        verifyNoInteractions(verificationService);
    }

    @Test
    void shouldRejectMissingPortableProof() throws Exception {
        var body = request();
        body.remove("portableProof");

        assertBadRequest(body);

        verifyNoInteractions(verificationService);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "version",
            "hashAlgorithm",
            "documentHash",
            "timestampAt",
            "timestampTokenBase64"
    })
    void shouldValidateRequiredNestedFields(String field) throws Exception {
        var body = request();
        var receipt = (ObjectNode) body.get("portableProof");
        receipt.remove(field);

        assertBadRequest(body);

        verifyNoInteractions(verificationService);
    }

    @Test
    void shouldRejectInvalidReceiptHash() throws Exception {
        var body = request();
        var receipt = (ObjectNode) body.get("portableProof");
        receipt.put("documentHash", "invalid");

        assertBadRequest(body);

        verifyNoInteractions(verificationService);
    }

    @Test
    void shouldRejectOversizedToken() throws Exception {
        var body = request();
        var receipt = (ObjectNode) body.get("portableProof");

        receipt.put(
                "timestampTokenBase64",
                "A".repeat(87_385)
        );

        assertBadRequest(body);

        verifyNoInteractions(verificationService);
    }

    @Test
    void shouldReturn400ForInvalidVerificationRequest() throws Exception {
        var body = request();
        var receipt = (ObjectNode) body.get("portableProof");
        receipt.put("timestampTokenBase64", "%%%");

        when(verificationService.verify(
                any(PortableProof.class),
                any(DocumentHash.class)
        )).thenThrow(new InvalidVerificationRequestException(
                "timestampTokenBase64 must contain valid Base64"
        ));

        assertBadRequest(body);

        verify(verificationService).verify(
                any(PortableProof.class),
                any(DocumentHash.class)
        );
    }

    private void assertBadRequest(ObjectNode body) throws Exception {
        mockMvc.perform(post("/api/v1/verifications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.APPLICATION_PROBLEM_JSON
                ))
                .andExpect(jsonPath("$.status").value(400));
    }

    private ObjectNode request() {
        var body = objectMapper.createObjectNode();
        body.put("documentHash", HASH);

        var receipt = body.putObject("portableProof");
        receipt.put("version", "1");
        receipt.put("hashAlgorithm", "SHA256");
        receipt.put("documentHash", HASH);
        receipt.put("timestampAt", TIMESTAMP.toString());
        receipt.put("timestampTokenBase64", ENCODED_TOKEN);

        return body;
    }

}
