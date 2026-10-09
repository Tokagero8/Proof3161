package io.github.tokagero8.proof3161.timestamp;

public interface TimestampTokenVerifier {

    VerifiedTimestamp verify(byte[] encodedToken)
        throws TimestampVerificationException;
}
