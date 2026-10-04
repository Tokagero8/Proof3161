package io.github.tokagero8.proof3161.timestamp.rfc3161;

import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.tsp.TSPException;
import org.bouncycastle.tsp.TimeStampToken;

import java.security.Provider;
import java.security.cert.CertificateException;
import java.util.Collection;
import java.util.Objects;

public class Rfc3161TokenValidator {

    private final Provider provider = new BouncyCastleProvider();

    public X509CertificateHolder validate(TimeStampToken token)
            throws TSPException,
            OperatorCreationException,
            CertificateException {

        Objects.requireNonNull(token, "token cannot be null");

        Collection<X509CertificateHolder> matches =
                token.getCertificates().getMatches(token.getSID());

        if (matches.size() != 1) {
            throw new TSPException(
                    "Expected exactly one TSA signing certificate, found "
                            + matches.size()
            );
        }

        var certificate = matches.iterator().next();

        var verifier = new JcaSimpleSignerInfoVerifierBuilder()
                .setProvider(provider)
                .build(certificate);

        token.validate(verifier);

        return certificate;
    }
}
