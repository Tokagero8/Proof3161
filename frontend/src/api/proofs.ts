import { isObject, isUtcTimestamp } from '../lib/validation'

export type ProofResponse = {
    id: string
    hashAlgorithm: 'SHA256'
    documentHash: string
    timestampAt: string
    timestampTokenBase64: string
    createdAt: string
}

function isProofResponse(value: unknown): value is ProofResponse {
    return isObject(value)
        && typeof value.id === 'string'
        && value.id.length > 0
        && value.hashAlgorithm === 'SHA256'
        && typeof value.documentHash === 'string'
        && /^[0-9a-fA-F]{64}$/.test(value.documentHash)
        && isUtcTimestamp(value.timestampAt)
        && typeof value.timestampTokenBase64 === 'string'
        && value.timestampTokenBase64.length > 0
        && isUtcTimestamp(value.createdAt)
}

export async function createProof(
    documentHash: string,
): Promise<ProofResponse> {
    let response: Response

    try {
        response = await fetch('/api/v1/proofs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ documentHash }),
        })
    } catch {
        throw new Error(
            'Unable to confirm whether the proof was created. '
            + 'Check your connection before trying again.',
        )
    }

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
        const detail = isObject(body)
        && typeof body.detail === 'string'
        && body.detail.trim().length > 0
            ? body.detail
            : `Could not create the proof (HTTP ${response.status}).`

        throw new Error(detail)
    }

    if (
        response.status !== 201
        || !isProofResponse(body)
        || body.documentHash.toLowerCase() !== documentHash.toLowerCase()
    ) {
        throw new Error(
            'The server returned an unexpected proof response.',
        )
    }

    return body
}