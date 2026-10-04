package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.bouncycastle.asn1.cmp.PKIStatus;
import org.bouncycastle.tsp.TSPException;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampResponse;

import java.io.IOException;
import java.util.Objects;

public final class Rfc3161ResponseValidator {

    public TimestampResult validate(
            TimeStampRequest request,
            byte[] responseBytes
    ) throws IOException, TSPException {
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

        var generationTime = token.getTimeStampInfo().getGenTime();
        if (generationTime == null) {
            throw new TSPException("Timestamp token has no generation time");
        }

        return new TimestampResult(
                generationTime.toInstant(),
                token.getEncoded()
        );
    }
}
