package io.github.tokagero8.proof3161.timestamp.rfc3161;

import java.security.GeneralSecurityException;
import java.security.cert.*;
import java.time.Instant;
import java.util.*;

public final class TsaCertificateTrustValidator {

    private final Set<TrustAnchor> trustAnchors;
    private final List<CertStore> additionalStores;
    private final Set<PKIXRevocationChecker.Option> revocationOptions;

    public TsaCertificateTrustValidator(
            Set<TrustAnchor> trustAnchors,
            List<CertStore> additionalStores
    ) {
        this(trustAnchors, additionalStores, Set.of());
    }

    public TsaCertificateTrustValidator(
            Set<TrustAnchor> trustAnchors,
            List<CertStore> additionalStores,
            Set<PKIXRevocationChecker.Option> revocationOptions
    ) {
        this.trustAnchors = Set.copyOf(trustAnchors);
        this.additionalStores = List.copyOf(additionalStores);
        this.revocationOptions = Set.copyOf(revocationOptions);

        if (this.trustAnchors.isEmpty()) {
            throw new IllegalArgumentException(
                    "At least one trusted root is required"
            );
        }
    }

    public PKIXCertPathBuilderResult validate(
            X509Certificate tsaCertificate,
            Collection<X509Certificate> suppliedCertificates,
            Instant validationTime
    ) throws GeneralSecurityException {
        Objects.requireNonNull(tsaCertificate, "tsaCertificate cannot be null");
        Objects.requireNonNull(
                suppliedCertificates,
                "suppliedCertificates cannot be null"
        );
        Objects.requireNonNull(validationTime, "validationTime cannot be null");

        var target = new X509CertSelector();
        target.setCertificate(tsaCertificate);

        var parameters = new PKIXBuilderParameters(trustAnchors, target);
        parameters.setDate(Date.from(validationTime));

        var candidates = new ArrayList<>(suppliedCertificates);
        candidates.add(tsaCertificate);

        parameters.addCertStore(CertStore.getInstance(
                "Collection",
                new CollectionCertStoreParameters(candidates)
        ));

        for (var store : additionalStores) {
            parameters.addCertStore(store);
        }

        var builder = CertPathBuilder.getInstance("PKIX");

        var revocationChecker =
                (PKIXRevocationChecker) builder.getRevocationChecker();

        revocationChecker.setOptions(revocationOptions);
        parameters.addCertPathChecker(revocationChecker);
        parameters.setRevocationEnabled(true);

        return (PKIXCertPathBuilderResult) builder.build(parameters);
    }
}
