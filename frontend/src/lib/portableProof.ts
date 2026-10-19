import {
    getBase64DecodedLength,
    isObject,
    isSha256,
    isUtcTimestamp,
} from './validation'

export const MAX_RECEIPT_FILE_BYTES = 128 * 1024
export const MAX_TIMESTAMP_TOKEN_BYTES = 65_536
export const MAX_TIMESTAMP_TOKEN_BASE64_LENGTH = 87_384

export type PortableProof = {
    readonly version: '1'
    readonly hashAlgorithm: 'SHA256'
    readonly documentHash: string
    readonly timestampAt: string
    readonly timestampTokenBase64: string
}

export class PortableProofInputError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'PortableProofInputError'
    }
}

export function parsePortableProof(value: unknown): PortableProof {
    if (!isObject(value)) {
        throw new PortableProofInputError(
            'The receipt must contain a JSON object.',
        )
    }

    if (value.version !== '1') {
        throw new PortableProofInputError(
            'Only portable proof version "1" is supported.',
        )
    }

    if (value.hashAlgorithm !== 'SHA256') {
        throw new PortableProofInputError(
            'Only the SHA256 hash algorithm is supported.',
        )
    }

    if (!isSha256(value.documentHash)) {
        throw new PortableProofInputError(
            'Receipt documentHash must contain exactly 64 hexadecimal characters.',
        )
    }

    if (!isUtcTimestamp(value.timestampAt)) {
        throw new PortableProofInputError(
            'Receipt timestampAt must be a valid UTC timestamp ending in Z.',
        )
    }

    const encodedToken = value.timestampTokenBase64

    if (typeof encodedToken !== 'string' || encodedToken.length === 0) {
        throw new PortableProofInputError(
            'Receipt timestampTokenBase64 must be a nonempty string.',
        )
    }

    if (encodedToken.length > MAX_TIMESTAMP_TOKEN_BASE64_LENGTH) {
        throw new PortableProofInputError(
            'The timestamp token must not exceed 87,384 Base64 characters.',
        )
    }

    const decodedLength = getBase64DecodedLength(encodedToken)

    if (decodedLength === null) {
        throw new PortableProofInputError(
            'Receipt timestampTokenBase64 must contain valid standard Base64.',
        )
    }

    if (decodedLength > MAX_TIMESTAMP_TOKEN_BYTES) {
        throw new PortableProofInputError(
            'The decoded timestamp token must not exceed 65,536 bytes.',
        )
    }

    // Explicitly copy only supported fields. Do not normalize evidence metadata.
    return {
        version: '1',
        hashAlgorithm: 'SHA256',
        documentHash: value.documentHash,
        timestampAt: value.timestampAt,
        timestampTokenBase64: encodedToken,
    }
}

export async function readPortableProof(file: File): Promise<PortableProof> {
    if (file.size === 0) {
        throw new PortableProofInputError('The receipt file is empty.')
    }

    if (file.size > MAX_RECEIPT_FILE_BYTES) {
        throw new PortableProofInputError(
            'The receipt file must not exceed 128 KiB.',
        )
    }

    let text: string

    try {
        text = await file.text()
    } catch {
        throw new PortableProofInputError(
            'Unable to read the receipt file. Please select it again.',
        )
    }

    let value: unknown

    try {
        // Permit a UTF-8 BOM from text editors.
        value = JSON.parse(text.replace(/^\uFEFF/, ''))
    } catch {
        throw new PortableProofInputError(
            'The receipt file does not contain valid JSON.',
        )
    }

    return parsePortableProof(value)
}