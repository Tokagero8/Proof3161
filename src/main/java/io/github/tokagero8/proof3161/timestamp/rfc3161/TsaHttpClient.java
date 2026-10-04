package io.github.tokagero8.proof3161.timestamp.rfc3161;

public interface TsaHttpClient {

    byte[] send(byte[] request);
}
