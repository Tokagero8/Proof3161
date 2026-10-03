package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.proof.HashAlgorithm;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class Rfc3161RequestFactoryTest {

    private final Rfc3161RequestFactory factory = new Rfc3161RequestFactory();

    @Test
    void shouldCreateTimestampRequestForSha256() {
        var documentHash = new DocumentHash(
                HashAlgorithm.SHA256,
                "0123456789abcdef".repeat(4)
        );
        byte[] expectedDigest = {
                0x01, 0x23, 0x45, 0x67, (byte) 0x89, (byte) 0xab, (byte) 0xcd, (byte) 0xef,
                0x01, 0x23, 0x45, 0x67, (byte) 0x89, (byte) 0xab, (byte) 0xcd, (byte) 0xef,
                0x01, 0x23, 0x45, 0x67, (byte) 0x89, (byte) 0xab, (byte) 0xcd, (byte) 0xef,
                0x01, 0x23, 0x45, 0x67, (byte) 0x89, (byte) 0xab, (byte) 0xcd, (byte) 0xef
        };

        var request = factory.create(documentHash);

        assertEquals(1, request.getVersion());
        assertEquals(
                NISTObjectIdentifiers.id_sha256,
                request.getMessageImprintAlgOID()
        );
        assertArrayEquals(
                expectedDigest,
                request.getMessageImprintDigest());
        assertTrue(request.getCertReq());
        assertNotNull(request.getNonce());
        assertTrue(request.getNonce().signum() > 0);
    }
}
