CREATE TABLE proofs (
    id UUID PRIMARY KEY,
    hash_algorithm VARCHAR(16) NOT NULL,
    document_hash VARCHAR(64) NOT NULL,
    timestamp_at TIMESTAMP WITH TIME ZONE NOT NULL,
    timestamp_token BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,

    CONSTRAINT proof_hash_algorithm_check CHECK (hash_algorithm = 'SHA256'),

    CONSTRAINT proofs_document_hash_check CHECK (document_hash ~ '^[0-9a-fA-F]{64}$'),

    CONSTRAINT proof_timestamp_token_check CHECK(octet_length(timestamp_token) > 0)

);