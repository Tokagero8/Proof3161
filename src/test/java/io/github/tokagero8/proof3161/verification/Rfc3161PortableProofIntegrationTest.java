package io.github.tokagero8.proof3161.verification;


import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import io.github.tokagero8.proof3161.timestamp.rfc3161.Rfc3161TimestampTokenVerifier;
import io.github.tokagero8.proof3161.timestamp.rfc3161.Rfc3161TokenValidator;
import io.github.tokagero8.proof3161.timestamp.rfc3161.TsaCertificateTrustValidator;
import org.bouncycastle.asn1.ASN1Encodable;
import org.bouncycastle.asn1.ASN1OctetString;
import org.bouncycastle.asn1.ASN1Primitive;
import org.bouncycastle.asn1.ASN1Sequence;
import org.bouncycastle.asn1.DEROctetString;
import org.bouncycastle.asn1.DERSequence;
import org.bouncycastle.asn1.cms.ContentInfo;
import org.bouncycastle.asn1.cms.SignedData;
import org.bouncycastle.asn1.tsp.MessageImprint;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import javax.security.auth.x500.X500Principal;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.cert.CertPathBuilder;
import java.security.cert.CertStore;
import java.security.cert.CertificateFactory;
import java.security.cert.CollectionCertStoreParameters;
import java.security.cert.PKIXRevocationChecker;
import java.security.cert.TrustAnchor;
import java.security.cert.X509CRL;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@Tag("offline-crypto")
public class Rfc3161PortableProofIntegrationTest {

    private PortableProof receipt;
    private DocumentHash expectedHash;
    private CertStore evidenceStore;
    private VerificationService service;

    @BeforeAll
    static void requireOfflinePkixConfiguration() throws Exception {
        assertEquals(
                "SUN",
                CertPathBuilder.getInstance("PKIX").getProvider().getName(),
                "This offline setup targets the JDK SUN PKIX provider"
        );

        assertEquals(
                "false",
                System.getProperty("com.sun.security.enableCRLDP"),
                "Run this class through the offlineProofTest Gradle task"
        );

        assertEquals(
                "false",
                System.getProperty("com.sun.security.enableAIAcaIssuers"),
                "Run this class through the offlineProofTest Gradle task"
        );
    }

    @BeforeEach
    void setUp() throws Exception {
        var json = JsonMapper.builder()
                .build()
                .readTree(resource("receipt.proof.json"));

        receipt = new PortableProof(
                json.get("version").asText(),
                new DocumentHash(
                        HashAlgorithm.valueOf(
                                json.get("hashAlgorithm").asText()
                        ),
                        json.get("documentHash").asText()
                ),
                Instant.parse(json.get("timestampAt").asText()),
                json.get("timestampTokenBase64").asText()
        );

        expectedHash = new DocumentHash(
                HashAlgorithm.SHA256,
                new String(
                        resource("expected-document.sha256"),
                        StandardCharsets.US_ASCII
                ).strip()
        );

        var factory = CertificateFactory.getInstance("X.509");

        var root = (X509Certificate) factory.generateCertificate(
                new ByteArrayInputStream(resource("tsa-root.pem"))
        );

        assertTrue(root.getBasicConstraints() >= 0);

        var evidence = new ArrayList<Object>();

        evidence.addAll(factory.generateCertificates(
                new ByteArrayInputStream(resource("tsa-chain.pem"))
        ));

        var crls = factory.generateCRLs(
                new ByteArrayInputStream(resource("issuer-crls.pem"))
        );

        assertFalse(crls.isEmpty(), "Fixture must contain applicable CRLs");

        for (var crl : crls) {
            var x509Crl = (X509CRL) crl;

            assertFalse(
                    x509Crl.getThisUpdate().toInstant()
                            .isAfter(receipt.timestampAt()),
                    "Fixture CRL was issued after the validation time"
            );

            assertNotNull(x509Crl.getNextUpdate());

            assertTrue(
                    x509Crl.getNextUpdate().toInstant()
                            .isAfter(receipt.timestampAt()),
                    "Fixture CRL does not cover the validation time"
            );
        }

        evidence.addAll(crls);

        evidenceStore = CertStore.getInstance(
                "Collection",
                new CollectionCertStoreParameters(evidence)
        );

        service = serviceUsing(
                Set.of(new TrustAnchor(root, null))
        );
    }

    @Test
    void shouldVerifySavedReceiptWithoutDatabaseOrTsa() {
        var result = service.verify(receipt, expectedHash);

        assertEquals(
                new VerificationResult(
                        VerificationStatus.VALID,
                        "VERIFIED",
                        receipt.timestampAt()
                ),
                result
        );
    }

    @Test
    void shouldRejectChangedDocumentHash() {
        var changedHash = changeFirstHexCharacter(expectedHash);

        var result = service.verify(receipt, changedHash);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                "DOCUMENT_HASH_MISMATCH"
        );
    }

    @Test
    void shouldRejectChangedReceiptHash() {
        var changedReceipt = new PortableProof(
                receipt.version(),
                changeFirstHexCharacter(receipt.documentHash()),
                receipt.timestampAt(),
                receipt.timestampTokenBase64()
        );

        var result = service.verify(changedReceipt, expectedHash);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                "RECEIPT_METADATA_MISMATCH"
        );
    }

    @Test
    void shouldRejectChangedReceiptTimestamp() {
        var changedReceipt = new PortableProof(
                receipt.version(),
                receipt.documentHash(),
                receipt.timestampAt().plusSeconds(1),
                receipt.timestampTokenBase64()
        );

        var result = service.verify(changedReceipt, expectedHash);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                "RECEIPT_METADATA_MISMATCH"
        );
    }

    @Test
    void shouldRejectCorruptedSignedContent() throws Exception {
        byte[] originalToken = Base64.getDecoder().decode(
                receipt.timestampTokenBase64()
        );

        byte[] corruptedToken = corruptSignedMessageImprint(originalToken);

        var changedReceipt = new PortableProof(
                receipt.version(),
                receipt.documentHash(),
                receipt.timestampAt(),
                Base64.getEncoder().encodeToString(corruptedToken)
        );

        var result = service.verify(changedReceipt, expectedHash);

        assertFailure(
                result,
                VerificationStatus.INVALID,
                "INVALID_TOKEN"
        );
    }

    @Test
    void shouldReturnIndeterminateForUnrelatedTrustAnchor() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);

        var unrelatedKey = generator.generateKeyPair().getPublic();

        var unrelatedAnchor = new TrustAnchor(
                new X500Principal("CN=Unrelated Test CA"),
                unrelatedKey,
                null
        );

        var untrustedService = serviceUsing(Set.of(unrelatedAnchor));

        var result = untrustedService.verify(receipt, expectedHash);

        assertFailure(
                result,
                VerificationStatus.INDETERMINATE,
                "TRUST_NOT_ESTABLISHED"
        );
    }

    private VerificationService serviceUsing(Set<TrustAnchor> anchors) {
        var trustValidator = new TsaCertificateTrustValidator(
                anchors,
                List.of(evidenceStore),
                Set.of(
                        PKIXRevocationChecker.Option.PREFER_CRLS,
                        PKIXRevocationChecker.Option.NO_FALLBACK
                )
        );

        var tokenVerifier = new Rfc3161TimestampTokenVerifier(
                new Rfc3161TokenValidator(),
                trustValidator
        );

        return new VerificationService(tokenVerifier);
    }

    private static DocumentHash changeFirstHexCharacter(
            DocumentHash original
    ) {
        String value = original.value();
        char replacement = value.charAt(0) == '0' ? '1' : '0';

        return new DocumentHash(
                original.algorithm(),
                replacement + value.substring(1)
        );
    }

    private static byte[] corruptSignedMessageImprint(
            byte[] encodedToken
    ) throws IOException {
        var outer = ContentInfo.getInstance(
                ASN1Primitive.fromByteArray(encodedToken)
        );

        var signedData = SignedData.getInstance(outer.getContent());
        var encapsulated = signedData.getEncapContentInfo();

        byte[] encodedInfo = ASN1OctetString
                .getInstance(encapsulated.getContent())
                .getOctets();

        var info = ASN1Sequence.getInstance(
                ASN1Primitive.fromByteArray(encodedInfo)
        );

        var imprint = MessageImprint.getInstance(info.getObjectAt(2));

        byte[] changedDigest = imprint.getHashedMessage().clone();
        changedDigest[0] ^= 1;

        var fields = new ASN1Encodable[info.size()];

        for (int i = 0; i < fields.length; i++) {
            fields[i] = info.getObjectAt(i);
        }

        fields[2] = new MessageImprint(
                imprint.getHashAlgorithm(),
                changedDigest
        );

        var changedContent = new ContentInfo(
                encapsulated.getContentType(),
                new DEROctetString(
                        new DERSequence(fields).getEncoded()
                )
        );

        var changedSignedData = new SignedData(
                signedData.getDigestAlgorithms(),
                changedContent,
                signedData.getCertificates(),
                signedData.getCRLs(),
                signedData.getSignerInfos()
        );

        return new ContentInfo(
                outer.getContentType(),
                changedSignedData
        ).getEncoded();
    }

    private static byte[] resource(String name) throws IOException {
        String path = "/fixtures/rfc3161/" + name;

        try (var input =
                     Rfc3161PortableProofIntegrationTest.class
                             .getResourceAsStream(path)) {
            if (input == null) {
                throw new IOException("Missing test fixture: " + path);
            }

            return input.readAllBytes();
        }
    }

    private static void assertFailure(
            VerificationResult result,
            VerificationStatus status,
            String reason
    ) {
        assertEquals(status, result.status());
        assertEquals(reason, result.reason());
        assertNull(result.timestampAt());
    }
}
