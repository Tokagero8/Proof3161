package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.proof.ProofService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping(
        value = "/api/v1/proofs",
        produces = MediaType.APPLICATION_JSON_VALUE
)
public class ProofController {

    private final ProofService proofService;

    public ProofController(ProofService proofService) {
        this.proofService = Objects.requireNonNull(
                proofService,
                "proofService cannot be null"
        );
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ProofResponse> createProof(
            @Valid @RequestBody CreateProofRequest request
    ) {
        var proof = proofService.createProof(
                request.toDocumentHash()
        );

        var location = ServletUriComponentsBuilder
                .fromCurrentRequestUri()
                .path("/{id}")
                .buildAndExpand(proof.id())
                .toUri();

        return ResponseEntity.created(location)
                .body(ProofResponse.fromDomain(proof));
    }

    @GetMapping("/{id}")
    public ProofResponse findById(
            @PathVariable("id") UUID id
    ) {
        var proof = proofService.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Proof not found"
                ));

        return ProofResponse.fromDomain(proof);
    }

    @GetMapping("/{id}/receipt")
    public ResponseEntity<PortableProofResponse> downloadReceipt(
            @PathVariable("id") UUID id
    ) {
        var proof = proofService.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Proof not found"
                ));

        var disposition = ContentDisposition.attachment()
                .filename("proof3161-" + id + ".proof.json")
                .build();

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        disposition.toString()
                )
                .body(PortableProofResponse.fromDomain(proof));
    }
}
