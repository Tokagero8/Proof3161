package io.github.tokagero8.proof3161.timestamp.rfc3161;

import io.github.tokagero8.proof3161.proof.DocumentHash;
import io.github.tokagero8.proof3161.timestamp.TimestampAuthority;
import io.github.tokagero8.proof3161.timestamp.TimestampException;
import io.github.tokagero8.proof3161.timestamp.TimestampResult;
import org.bouncycastle.tsp.TSPException;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Objects;

public class Rfc3161TimestampAuthority implements TimestampAuthority {

    private final Rfc3161Client client;
    private final Rfc3161ResponseValidator responseValidator;

    public Rfc3161TimestampAuthority(
            Rfc3161Client client,
            Rfc3161ResponseValidator responseValidator
    ) {
        this.client = Objects.requireNonNull(client);
        this.responseValidator = Objects.requireNonNull(responseValidator);
    }

    @Override
    public TimestampResult timestamp(DocumentHash documentHash) {
        Objects.requireNonNull(documentHash, "documentHash cannot be null");

        var exchange = client.send(documentHash);

        try{
            return responseValidator.validate(
                    exchange.request(),
                    exchange.responseBytes()
            );
        } catch (IOException
                | TSPException
                | GeneralSecurityException exception){
            throw new TimestampException(
                    "Failed to validate TSA response", exception
            );
        }
    }
}
