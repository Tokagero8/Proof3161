package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import io.github.tokagero8.proof3161.timestamp.TimestampTokenVerifier;
import org.bouncycastle.asn1.cmp.PKIStatus;
import org.bouncycastle.tsp.TSPException;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampResponse;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Objects;

public final class Rfc3161ResponseValidator {

    private final TimestampTokenVerifier tokenVerifier;

    public Rfc3161ResponseValidator(
            TimestampTokenVerifier tokenVerifier
    ) {
        this.tokenVerifier = Objects.requireNonNull(tokenVerifier);
    }

    public TimestampResult validate(
            TimeStampRequest request,
            byte[] responseBytes
    ) throws IOException,
            TSPException,
            GeneralSecurityException {

        Objects.requireNonNull(request, "request cannot be null");
        Objects.requireNonNull(responseBytes, "responseBytes cannot be null");

        if (responseBytes.length == 0) {
            throw new TSPException("TSA returned an empty response");
        }

        var response = new TimeStampResponse(responseBytes);

        int status = response.getStatus();

        if (status != PKIStatus.GRANTED
                && status != PKIStatus.GRANTED_WITH_MODS) {
            throw new TSPException(
                    "TSA rejected the request: status=" + status
                            + ", message=" + response.getStatusString()
                            + ", failure Info= " + response.getFailInfo()
            );
        }

        response.validate(request);

        var token = response.getTimeStampToken();

        if (token == null) {
            throw new TSPException(
                    "Successful response must contain a timestamp token"
            );
        }

        byte[] encodedToken = token.getEncoded();
        var verified = tokenVerifier.verify(encodedToken);

        return new TimestampResult(
                verified.timestamp(),
                encodedToken
        );
    }
}
