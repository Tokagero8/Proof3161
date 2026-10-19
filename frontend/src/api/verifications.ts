import {
    PortableProofInputError,
    parsePortableProof,
} from '../lib/portableProof'
import type { PortableProof } from '../lib/portableProof'
import { isObject, isSha256, isUtcTimestamp } from '../lib/validation'

export const VERIFICATION_TIMEOUT_MS = 60_000

export type VerificationResponse =
    | {
    status: 'VALID'
    reason: 'VERIFIED'
    timestampAt: string
}
    | {
    status: 'INVALID' | 'INDETERMINATE'
    reason: string
    timestampAt: null
}

export type VerificationErrorCode =
    | 'INPUT'
    | 'HTTP'
    | 'NETWORK'
    | 'INVALID_RESPONSE'
    | 'CANCELLED'
    | 'TIMEOUT'

export class VerificationRequestError extends Error {
    readonly code: VerificationErrorCode
    readonly status: number | undefined

    constructor(
        code: VerificationErrorCode,
        message: string,
        status?: number,
    ) {
        super(message)
        this.name = 'VerificationRequestError'
        this.code = code
        this.status = status
    }
}

function invalidResponse(): VerificationRequestError {
    return new VerificationRequestError(
        'INVALID_RESPONSE',
        'The server returned an unexpected verification response.',
    )
}

function parseVerificationResponse(value: unknown): VerificationResponse {
    if (!isObject(value)) {
        throw invalidResponse()
    }

    if (value.status === 'VALID') {
        if (value.reason !== 'VERIFIED' || !isUtcTimestamp(value.timestampAt)) {
            throw invalidResponse()
        }

        return {
            status: 'VALID',
            reason: 'VERIFIED',
            timestampAt: value.timestampAt,
        }
    }

    if (
        (value.status === 'INVALID' || value.status === 'INDETERMINATE')
        && typeof value.reason === 'string'
        && value.reason.trim().length > 0
        && value.reason !== 'VERIFIED'
        && value.timestampAt === null
    ) {
        return {
            status: value.status,
            reason: value.reason,
            timestampAt: null,
        }
    }

    throw invalidResponse()
}

function httpError(
    status: number,
    body?: unknown,
): VerificationRequestError {
    const detail = isObject(body)
    && typeof body.detail === 'string'
    && body.detail.trim().length > 0
        ? body.detail
        : `Verification request failed (HTTP ${status}).`

    return new VerificationRequestError('HTTP', detail, status)
}

async function sendVerificationRequest(
    documentHash: string,
    portableProof: PortableProof,
    signal: AbortSignal,
): Promise<VerificationResponse> {
    let response: Response

    try {
        response = await fetch('/api/v1/verifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                documentHash,
                portableProof,
            }),
            signal,
        })
    } catch {
        throw new VerificationRequestError(
            'NETWORK',
            'Unable to reach the verification service. Please try again.',
        )
    }

    let body: unknown

    try {
        body = await response.json()
    } catch (error) {
        if (!response.ok) {
            throw httpError(response.status)
        }

        if (error instanceof SyntaxError) {
            throw invalidResponse()
        }

        throw new VerificationRequestError(
            'NETWORK',
            'Unable to read the verification response. Please try again.',
        )
    }

    if (!response.ok) {
        throw httpError(response.status, body)
    }

    if (response.status !== 200) {
        throw invalidResponse()
    }

    return parseVerificationResponse(body)
}

export async function verifyProof(
    documentHash: string,
    portableProof: PortableProof,
    signal?: AbortSignal,
): Promise<VerificationResponse> {
    if (signal?.aborted) {
        throw new VerificationRequestError(
            'CANCELLED',
            'Verification was cancelled.',
        )
    }

    if (!isSha256(documentHash)) {
        throw new VerificationRequestError(
            'INPUT',
            'The document hash must contain exactly 64 hexadecimal characters.',
        )
    }

    let validatedReceipt: PortableProof

    try {
        // Revalidate and copy only supported fields at the HTTP boundary.
        validatedReceipt = parsePortableProof(portableProof)
    } catch (error) {
        if (error instanceof PortableProofInputError) {
            throw new VerificationRequestError('INPUT', error.message)
        }

        throw error
    }

    const controller = new AbortController()

    let rejectInterruption!: (error: VerificationRequestError) => void

    const interrupted = new Promise<never>((_, reject) => {
        rejectInterruption = reject
    })

    const interrupt = (code: 'CANCELLED' | 'TIMEOUT'): void => {
        if (controller.signal.aborted) {
            return
        }

        const message = code === 'CANCELLED'
            ? 'Verification was cancelled.'
            : 'Verification timed out. Please try again.'

        // Reject first so cancellation/timeout remains the public error,
        // even if aborting fetch also causes a network/body-read rejection.
        rejectInterruption(new VerificationRequestError(code, message))
        controller.abort()
    }

    const onAbort = (): void => interrupt('CANCELLED')

    signal?.addEventListener('abort', onAbort, { once: true })

    const timeout = globalThis.setTimeout(
        () => interrupt('TIMEOUT'),
        VERIFICATION_TIMEOUT_MS,
    )

    try {
        // Also cover cancellation between the initial check and registration.
        if (signal?.aborted) {
            onAbort()
            return await interrupted
        }

        return await Promise.race([
            sendVerificationRequest(
                documentHash,
                validatedReceipt,
                controller.signal,
            ),
            interrupted,
        ])
    } finally {
        globalThis.clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
    }
}