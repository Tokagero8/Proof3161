package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.timestamp.TimestampTokenVerifier;
import io.github.tokagero8.proof3161.timestamp.TimestampVerificationException;
import io.github.tokagero8.proof3161.timestamp.VerifiedTimestamp;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cms.CMSException;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignerDigestMismatchException;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.tsp.TSPException;
import org.bouncycastle.tsp.TSPValidationException;
import org.bouncycastle.tsp.TimeStampToken;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.cert.CertPathValidatorException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.Objects;

import static io.github.tokagero8.proof3161.timestamp.TimestampVerificationException.Reason.*;

public class Rfc3161TimestampTokenVerifier implements TimestampTokenVerifier {

    private static final int MAX_TOKEN_BYTES = 65_536;

    private final Rfc3161TokenValidator tokenValidator;
    private final TsaCertificateTrustValidator trustValidator;

    public Rfc3161TimestampTokenVerifier(
            Rfc3161TokenValidator tokenValidator,
            TsaCertificateTrustValidator trustValidator
    ) {
        this.tokenValidator = Objects.requireNonNull(tokenValidator);
        this.trustValidator = Objects.requireNonNull(trustValidator);
    }

    @Override
    public VerifiedTimestamp verify(byte[] encodedToken)
            throws TimestampVerificationException {

        Objects.requireNonNull(encodedToken, "encodedToken cannot be null");

        if (encodedToken.length == 0
                || encodedToken.length > MAX_TOKEN_BYTES) {
            throw new TimestampVerificationException(
                    MALFORMED_TOKEN,
                    "timestamp token has an invalid size"
            );
        }

        var token = parseToken(encodedToken);
        var info = token.getTimeStampInfo();

        if (!NISTObjectIdentifiers.id_sha256.equals(
                info.getMessageImprintAlgOID()
        )) {
            throw new TimestampVerificationException(
                    UNSUPPORTED_ALGORITHM,
                    "Only SHA-256 message imprints are supported"
            );
        }

        byte[] digest = info.getMessageImprintDigest();

        if (digest.length != 32) {
            throw new TimestampVerificationException(
                    INVALID_TOKEN,
                    "SHA-256 message imprint must contain 32 bytes"
            );
        }

        var generationTime = info.getGenTime();

        if (generationTime == null) {
            throw new TimestampVerificationException(
                    INVALID_TOKEN,
                    "Timestamp token has no generation time"
            );
        }

        var generatedAt = generationTime.toInstant();
        var signer = validateToken(token);

        validateTrust(token, signer, generatedAt);

        return new VerifiedTimestamp(
                new DocumentHash(
                        HashAlgorithm.SHA256,
                        HexFormat.of().formatHex(digest)
                ),
                generatedAt
        );
    }

    private TimeStampToken parseToken(byte[] encodedToken)
        throws TimestampVerificationException {
        try {
            return new TimeStampToken(
                    new CMSSignedData(encodedToken)
            );
        } catch (CMSException
                | TSPException
                | IOException
                | IllegalArgumentException
                | ClassCastException exception) {
            throw new TimestampVerificationException(
                    MALFORMED_TOKEN,
                    "Cannot parse the RFC 3161 timestamp token",
                    exception
            );
        }
    }

    private X509CertificateHolder validateToken(TimeStampToken token)
        throws TimestampVerificationException {

        var matches = token.getCertificates().getMatches(token.getSID());

        if (matches.size() != 1) {
            throw new TimestampVerificationException(
                    SIGNER_CERTIFICATE_UNAVAILABLE,
                    "Cannot identify exactly one embedded TSA signing certificate"
            );
        }

        try {
            return tokenValidator.validate(token);
        } catch (TSPValidationException exception) {
            throw new TimestampVerificationException(
                    INVALID_TOKEN,
                    "Timestamp signature or signing certificate is invalid",
                    exception
            );
        } catch (TSPException exception) {
            if (hasCause(
                    exception,
                    CMSSignerDigestMismatchException.class
            )) {
                throw new TimestampVerificationException(
                        INVALID_TOKEN,
                        "Signed content does not match its digest",
                        exception
                );
            }

            throw new TimestampVerificationException(
                    VERIFICATION_UNAVAILABLE,
                    "Timestamp cryptographic verification could not be completed",
                    exception
            );
        } catch (OperatorCreationException | CertificateException exception) {
            throw new TimestampVerificationException(
                    VERIFICATION_UNAVAILABLE,
                    "cannot construct the timestamp signature verifier",
                    exception
            );
        }
    }

    private void validateTrust(
            TimeStampToken token,
            X509CertificateHolder signer,
            Instant generatedAt
    ) throws TimestampVerificationException {
        try {
            var converter = new JcaX509CertificateConverter()
                    .setProvider(new BouncyCastleProvider());

            var tsaCertificate = converter.getCertificate(signer);
            var suppliedCertificates = new ArrayList<X509Certificate>();

            for (var holder : token.getCertificates().getMatches(null)) {
                suppliedCertificates.add(
                        converter.getCertificate(holder)
                );
            }

            trustValidator.validate(
                    tsaCertificate,
                    suppliedCertificates,
                    generatedAt
            );
        } catch (GeneralSecurityException exception) {
            if (hasRevocationFailure(exception)) {
                throw new TimestampVerificationException(
                        CERTIFICATE_REVOKED,
                        "Certificate validation reported revocation",
                        exception
                );
            }

            throw new TimestampVerificationException(
                    TRUST_NOT_ESTABLISHED,
                    "certificate trust could not be established",
                    exception
            );
        }
    }

    private static boolean hasRevocationFailure(Throwable exception) {
        for (Throwable current = exception;
             current != null;
             current = current.getCause()) {

            if (current instanceof CertPathValidatorException failure
                    && failure.getReason()
                    == CertPathValidatorException.BasicReason.REVOKED) {
                return true;
            }
        }

        return false;
    }

    private static boolean hasCause(
            Throwable exception,
            Class<? extends Throwable> type
    ) {
        for (Throwable current = exception;
             current != null;
             current = current.getCause()) {

            if (type.isInstance(current)) {
                return true;
            }
        }
        return false;
    }
}
