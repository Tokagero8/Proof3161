import type { VerificationResponse } from '../api/verifications'

type VerificationResultProps = {
    result: VerificationResponse
}

const TITLES = {
    VALID: 'Verification succeeded',
    INVALID: 'Verification failed',
    INDETERMINATE: 'Verification incomplete',
} satisfies Record<VerificationResponse['status'], string>

function explainReason(result: VerificationResponse): string {
    if (result.status === 'VALID') {
        return "Verification succeeded under the server's configured trust policy."
    }

    if (result.status === 'INVALID') {
        switch (result.reason) {
            case 'DOCUMENT_HASH_MISMATCH':
                return 'The selected document does not match the fingerprint in the signed timestamp.'

            case 'RECEIPT_METADATA_MISMATCH':
                return 'The receipt hash or timestamp does not match the signed timestamp token.'

            case 'MALFORMED_TOKEN':
                return 'The timestamp token could not be read as a valid RFC 3161 token.'

            case 'INVALID_TOKEN':
                return 'The timestamp token failed signature or signing-certificate validation.'

            case 'CERTIFICATE_REVOKED':
                return 'A certificate used to establish timestamp trust was reported revoked under the server’s validation policy.'

            default:
                return 'The server reported a verification failure with an unfamiliar reason code.'
        }
    }

    switch (result.reason) {
        case 'SIGNER_CERTIFICATE_UNAVAILABLE':
            return 'The certificate needed to verify the timestamp signature was unavailable.'

        case 'UNSUPPORTED_ALGORITHM':
            return 'The server does not support an algorithm required to verify this timestamp.'

        case 'TRUST_NOT_ESTABLISHED':
            return 'The server could not establish certificate trust under its configured policy.'

        case 'VERIFICATION_UNAVAILABLE':
            return 'A required verification operation or source of verification evidence was unavailable.'

        default:
            return 'The server could not finish verification for an unfamiliar reason.'
    }
}

export function VerificationResult({ result }: VerificationResultProps) {
    return (
        <div
            className={`verification-result verification-result--${result.status.toLowerCase()}`}
        >
            <h3>
                {result.status}: {TITLES[result.status]}
            </h3>

            {result.status === 'INVALID' && (
                <p>
                    The backend detected a definite mismatch or verification failure.
                </p>
            )}

            {result.status === 'INDETERMINATE' && (
                <p>
                    The backend could not complete verification or establish trust.
                </p>
            )}

            <p>{explainReason(result)}</p>

            {result.status === 'INDETERMINATE' && (
                <p>
                    This does not automatically mean the document or receipt was falsified.
                </p>
            )}

            {result.status === 'VALID' && (
                <dl>
                    <dt>Verified timestamp (UTC)</dt>
                    <dd>
                        <time dateTime={result.timestampAt}>
                            {result.timestampAt}
                        </time>
                    </dd>
                </dl>
            )}

            {result.status !== 'VALID' && (
                <details className="verification-technical-details">
                    <summary>Technical details</summary>
                    <p>
                        Reason:{' '}
                        <span className="verification-reason-code">
                            {result.reason}
                        </span>
                    </p>
                </details>
            )}
        </div>
    )
}