// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    MAX_RECEIPT_FILE_BYTES,
    MAX_TIMESTAMP_TOKEN_BASE64_LENGTH,
    MAX_TIMESTAMP_TOKEN_BYTES,
    PortableProofInputError,
    parsePortableProof,
    readPortableProof,
} from './portableProof'
import type { PortableProof } from './portableProof'

const RECEIPT: PortableProof = {
    version: '1',
    hashAlgorithm: 'SHA256',
    documentHash: 'a'.repeat(64),
    timestampAt: '2026-10-17T10:16:54.123456789Z',
    // Synthetic bytes, not a real RFC 3161 token.
    timestampTokenBase64: 'AQIDBA==',
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('parsePortableProof', () => {
    it('preserves the five supported fields and discards extra properties', () => {
        const input = {
            ...RECEIPT,
            documentHash: RECEIPT.documentHash.toUpperCase(),
            timestampTokenBase64: 'AQIDBA',
            filename: 'private-document.txt',
            id: 'unneeded-database-id',
            trusted: true,
        }

        const result = parsePortableProof(input)

        expect(result).toEqual({
            ...RECEIPT,
            documentHash: RECEIPT.documentHash.toUpperCase(),
            timestampTokenBase64: 'AQIDBA',
        })
        expect(result).not.toBe(input)
    })

    it.each([
        { value: null },
        { value: [] },
        { value: 'receipt' },
        { value: 123 },
    ])('rejects a non-object receipt: $value', ({ value }) => {
        expect(() => parsePortableProof(value)).toThrow(
            PortableProofInputError,
        )
    })

    it.each([
        'version',
        'hashAlgorithm',
        'documentHash',
        'timestampAt',
        'timestampTokenBase64',
    ])('requires %s', field => {
        const input: Record<string, unknown> = { ...RECEIPT }
        delete input[field]

        expect(() => parsePortableProof(input)).toThrow(
            PortableProofInputError,
        )
    })

    it.each([
        { patch: { version: '2' }, message: 'version "1"' },
        { patch: { version: 1 }, message: 'version "1"' },
        { patch: { hashAlgorithm: 'SHA-256' }, message: 'SHA256' },
        { patch: { hashAlgorithm: null }, message: 'SHA256' },
        { patch: { documentHash: 'g'.repeat(64) }, message: 'documentHash' },
        { patch: { documentHash: 123 }, message: 'documentHash' },
        {
            patch: { documentHash: `${'a'.repeat(64)}\n` },
            message: 'documentHash',
        },
        { patch: { timestampAt: '2026' }, message: 'timestampAt' },
        {
            patch: { timestampAt: '2026-02-30T10:16:54Z' },
            message: 'timestampAt',
        },
        { patch: { timestampAt: null }, message: 'timestampAt' },
        { patch: { timestampTokenBase64: '' }, message: 'nonempty string' },
        { patch: { timestampTokenBase64: 123 }, message: 'nonempty string' },
        { patch: { timestampTokenBase64: 'AA=' }, message: 'standard Base64' },
        { patch: { timestampTokenBase64: '%%%' }, message: 'standard Base64' },
    ])('rejects invalid fields: $patch', ({ patch, message }) => {
        expect(() => parsePortableProof({
            ...RECEIPT,
            ...patch,
        })).toThrow(message)
    })

    it.each(['AQIDBA==', 'AQIDBA'])('accepts token encoding %s', token => {
        expect(parsePortableProof({
            ...RECEIPT,
            timestampTokenBase64: token,
        }).timestampTokenBase64).toBe(token)
    })

    it('accepts exactly the maximum decoded token size', () => {
        const token = btoa('\0'.repeat(MAX_TIMESTAMP_TOKEN_BYTES))

        expect(token).toHaveLength(MAX_TIMESTAMP_TOKEN_BASE64_LENGTH)

        for (const encoding of [token, token.replace(/=+$/, '')]) {
            expect(parsePortableProof({
                ...RECEIPT,
                timestampTokenBase64: encoding,
            }).timestampTokenBase64).toBe(encoding)
        }
    })

    it('rejects decoded overflow even when encoded length is permitted', () => {
        const token = btoa('\0'.repeat(MAX_TIMESTAMP_TOKEN_BYTES + 1))

        expect(token).toHaveLength(MAX_TIMESTAMP_TOKEN_BASE64_LENGTH)

        expect(() => parsePortableProof({
            ...RECEIPT,
            timestampTokenBase64: token,
        })).toThrow('65,536 bytes')
    })

    it('rejects excessive encoded length', () => {
        expect(() => parsePortableProof({
            ...RECEIPT,
            timestampTokenBase64:
                'A'.repeat(MAX_TIMESTAMP_TOKEN_BASE64_LENGTH + 1),
        })).toThrow('87,384 Base64 characters')
    })
})

describe('readPortableProof', () => {
    it('reads valid JSON regardless of filename or MIME type', async () => {
        const file = new File(
            [JSON.stringify(RECEIPT)],
            'receipt.txt',
            { type: 'text/plain' },
        )

        await expect(readPortableProof(file)).resolves.toEqual(RECEIPT)
    })

    it('accepts a UTF-8 BOM and surrounding JSON whitespace', async () => {
        const file = new File(
            [`\uFEFF \n${JSON.stringify(RECEIPT)}\n`],
            'receipt.proof.json',
        )

        await expect(readPortableProof(file)).resolves.toEqual(RECEIPT)
    })

    it('accepts a receipt exactly at the file-size limit', async () => {
        const json = JSON.stringify(RECEIPT)
        const padding = ' '.repeat(MAX_RECEIPT_FILE_BYTES - json.length)
        const file = new File([json, padding], 'receipt.proof.json')

        expect(file.size).toBe(MAX_RECEIPT_FILE_BYTES)
        await expect(readPortableProof(file)).resolves.toEqual(RECEIPT)
    })

    it('rejects an oversized receipt before reading it', async () => {
        const file = new File(
            [' '.repeat(MAX_RECEIPT_FILE_BYTES + 1)],
            'receipt.proof.json',
        )
        const read = vi.spyOn(file, 'text')

        await expect(readPortableProof(file)).rejects.toThrow('128 KiB')
        expect(read).not.toHaveBeenCalled()
    })

    it('rejects an empty file before reading it', async () => {
        const file = new File([], 'receipt.proof.json')
        const read = vi.spyOn(file, 'text')

        await expect(readPortableProof(file)).rejects.toThrow('empty')
        expect(read).not.toHaveBeenCalled()
    })

    it.each(['not JSON', '{', '   '])('rejects malformed JSON: %j', async text => {
        const file = new File([text], 'receipt.proof.json')

        await expect(readPortableProof(file)).rejects.toThrow(
            'does not contain valid JSON',
        )
    })

    it('validates the structure after parsing JSON', async () => {
        const file = new File(['[]'], 'receipt.proof.json')

        await expect(readPortableProof(file)).rejects.toThrow(
            'must contain a JSON object',
        )
    })

    it('reports a file-reading failure', async () => {
        const file = new File(['content'], 'receipt.proof.json')
        vi.spyOn(file, 'text').mockRejectedValue(new Error('Read failed'))

        await expect(readPortableProof(file)).rejects.toThrow(
            'Unable to read the receipt file',
        )
    })
})