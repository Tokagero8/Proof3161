package io.github.tokagero8.proof3161.proof;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class DocumentHashTest {

    @Test
    void shouldCreateValidSha256Hash() {
        var hash = new DocumentHash(
                HashAlgorithm.SHA256,
                "a".repeat(64)
        );

        assertEquals(HashAlgorithm.SHA256, hash.algorithm());
        assertEquals("a".repeat(64), hash.value());
    }

    @Test
    void shouldRejectInvalidSha256Hash() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new DocumentHash(
                        HashAlgorithm.SHA256,
                        "invalid"
                )
        );
    }
}
