package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.bouncycastle.asn1.cmp.PKIStatus;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.tsp.TSPException;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampResponse;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Objects;

public final class Rfc3161ResponseValidator {

    private final Rfc3161TokenValidator tokenValidator;
    private final TsaCertificateTrustValidator trustValidator;

    public Rfc3161ResponseValidator(
            Rfc3161TokenValidator tokenValidator,
            TsaCertificateTrustValidator trustValidator
    ) {
        this.tokenValidator = Objects.requireNonNull(tokenValidator);
        this.trustValidator = Objects.requireNonNull(trustValidator);
    }

    public TimestampResult validate(
            TimeStampRequest request,
            byte[] responseBytes
    ) throws IOException,
            TSPException,
            OperatorCreationException,
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

        var signerHolder = tokenValidator.validate(token);

        var converter = new JcaX509CertificateConverter()
                .setProvider(new BouncyCastleProvider());

        var tsaCertificate = converter.getCertificate(signerHolder);

        var suppliedCertificates = new ArrayList<X509Certificate>();
        for(var holder : token.getCertificates().getMatches(null)) {
            suppliedCertificates.add(converter.getCertificate(holder));
        }

        var generationTime = token.getTimeStampInfo().getGenTime();
        if (generationTime == null) {
            throw new TSPException("Timestamp token has no generation time");
        }

        var generatedAt = generationTime.toInstant();

        trustValidator.validate(
                tsaCertificate,
                suppliedCertificates,
                generatedAt
        );

        return new TimestampResult(
                generationTime.toInstant(),
                token.getEncoded()
        );
    }
}
