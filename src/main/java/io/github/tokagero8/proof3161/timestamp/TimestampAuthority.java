package io.github.tokagero8.proof3161.timestamp;

import io.github.tokagero8.proof3161.proof.DocumentHash;

public interface TimestampAuthority {

    TimestampResult timestamp(DocumentHash documentHash);
}
