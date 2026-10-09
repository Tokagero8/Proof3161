package io.github.tokagero8.proof3161.verification.api;

import io.github.tokagero8.proof3161.verification.VerificationService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;

@RestController
@RequestMapping(
        value = "/api/v1/verifications",
        produces = MediaType.APPLICATION_JSON_VALUE
)
public class VerificationController {

    private final VerificationService verificationService;

    public VerificationController(
            VerificationService verificationService
    ) {
        this.verificationService = Objects.requireNonNull(verificationService);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public VerificationResponse verify(
            @Valid @RequestBody VerifyProofRequest request
    ) {
        var result = verificationService.verify(
                request.portableProof().toDomain(),
                request.toDocumentHash()
        );

        return VerificationResponse.fromDomain(result);
    }
}
