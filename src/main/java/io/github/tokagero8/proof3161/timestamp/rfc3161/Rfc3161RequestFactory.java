package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampRequestGenerator;

import java.math.BigInteger;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Objects;

public class Rfc3161RequestFactory {

    private final SecureRandom random = new SecureRandom();

    public TimeStampRequest create(DocumentHash documentHash) {
        Objects.requireNonNull(documentHash, "documentHash cannot be null");

        ASN1ObjectIdentifier algorithmOid = switch (documentHash.algorithm()) {
            case SHA256 -> NISTObjectIdentifiers.id_sha256;
        };

        byte[] digest = HexFormat.of().parseHex(documentHash.value());
        BigInteger nonce = new BigInteger(128, random).setBit(127);

        var generator = new TimeStampRequestGenerator();
        generator.setCertReq(true);

        return generator.generate(algorithmOid, digest, nonce);
    }
}
