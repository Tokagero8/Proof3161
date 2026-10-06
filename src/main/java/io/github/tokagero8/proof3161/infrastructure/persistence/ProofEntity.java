package io.github.tokagero8.proof3161.infrastructure.persistence;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.proof.Proof;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "proofs")
public class ProofEntity {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "hash_algorithm", nullable = false, length = 16)
    private HashAlgorithm hashAlgorithm;

    @Column(name = "document_hash", nullable = false, length = 64)
    private String documentHash;

    @Column(name = "timestamp_at", nullable = false)
    private Instant timestampAt;

    @Column(name = "timestamp_token", nullable = false, columnDefinition = "bytea")
    private byte[] timestampToken;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ProofEntity() {
        //
    }

    private ProofEntity(Proof proof){
        this.id = proof.id();
        this.hashAlgorithm = proof.documentHash().algorithm();
        this.documentHash = proof.documentHash().value();
        this.timestampAt = proof.timestampResult().timestamp();
        this.timestampToken = proof.timestampResult().token();
        this.createdAt = proof.createdAt();
    }

    static ProofEntity fromDomain(Proof proof) {
        Objects.requireNonNull(proof, "proof cannot be null");

        return new ProofEntity(proof);
    }

    Proof toDomain() {
        return new Proof(
                id,
                new DocumentHash(
                        hashAlgorithm,
                        documentHash
                ),
                new TimestampResult(
                        timestampAt,
                        timestampToken
                ),
                createdAt
        );
    }
}
