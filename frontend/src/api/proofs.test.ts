// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProof } from './proofs'
import type { ProofResponse } from './proofs'

const DOCUMENT_HASH = 'a'.repeat(64)

// This is an HTTP response fixture, not a real cryptographic token.
const PROOF: ProofResponse = {
    id: 'adfe140a-0bce-45b6-8bd7-ed652714c314',
    hashAlgorithm: 'SHA256',
    documentHash: DOCUMENT_HASH,
    timestampAt: '2026-10-17T12:00:00Z',
    timestampTokenBase64: 'AQIDBA==',
    createdAt: '2026-10-17T12:00:01Z',
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('createProof', () => {
    it('sends only the document hash and returns the created proof', async () => {
        fetchMock.mockResolvedValue(
            Response.json(PROOF, { status: 201 }),
        )

        const result = await createProof(DOCUMENT_HASH)

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            '/api/v1/proofs',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    documentHash: DOCUMENT_HASH,
                }),
            },
        )

        expect(result).toEqual(PROOF)
    })

    it.each([
        [400, 'Invalid request content.'],
        [
            502,
            'Could not obtain a valid timestamp from the timestamp authority.',
        ],
    ])('reports the problem detail for HTTP %i', async (status, detail) => {
        fetchMock.mockResolvedValue(
            Response.json({ status, detail }, { status }),
        )

        await expect(createProof(DOCUMENT_HASH)).rejects.toThrow(detail)
    })

    it('handles an error response without JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('Bad Gateway', { status: 502 }),
        )

        await expect(createProof(DOCUMENT_HASH)).rejects.toThrow(
            'Could not create the proof (HTTP 502).',
        )
    })

    it('reports network failure without automatically retrying', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

        await expect(createProof(DOCUMENT_HASH)).rejects.toThrow(
            'Unable to confirm whether the proof was created.',
        )

        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('rejects a successful response containing invalid JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('not JSON', { status: 201 }),
        )

        await expect(createProof(DOCUMENT_HASH)).rejects.toThrow(
            'The server returned an unexpected proof response.',
        )
    })

    it.each([
        null,
        {},
        { ...PROOF, timestampAt: 'invalid date' },
        { ...PROOF, documentHash: 'b'.repeat(64) },
    ])('rejects an invalid or inconsistent proof response: %j', async body => {
        fetchMock.mockResolvedValue(
            Response.json(body, { status: 201 }),
        )

        await expect(createProof(DOCUMENT_HASH)).rejects.toThrow(
            'The server returned an unexpected proof response.',
        )
    })

    describe.each(['timestampAt', 'createdAt'] as const)(
        '%s validation',
        field => {
            it.each([
                '2026-10-17T10:16:54Z',
                '2026-10-17T10:16:54.1Z',
                '2026-10-17T10:16:54.123Z',
                '2026-10-17T10:16:54.123456Z',
                '2026-10-17T10:16:54.123456789Z',
                '2024-02-29T10:16:54Z',
            ])('accepts %s without changing its precision', async value => {
                const response = {
                    ...PROOF,
                    [field]: value,
                }

                fetchMock.mockResolvedValue(
                    Response.json(response, { status: 201 }),
                )

                const result = await createProof(DOCUMENT_HASH)

                expect(result[field]).toBe(value)
            })

            it.each([
                null,
                2026,
                '2026',
                '2026-10-17',
                '2026-10-17 10:16:54Z',
                '2026-10-17T10:16:54',
                '2026-10-17T10:16:54+00:00',
                '2026-02-29T10:16:54Z',
                '2026-02-30T10:16:54Z',
                '2026-13-17T10:16:54Z',
                '2026-10-17T24:00:00Z',
                '2026-10-17T10:60:54Z',
                '2026-10-17T10:16:60Z',
                '2026-10-17T10:16:54.1234567890Z',
                '2026-10-17T10:16:54Z\n',
            ])('rejects %j', async value => {
                fetchMock.mockResolvedValue(
                    Response.json(
                        { ...PROOF, [field]: value },
                        { status: 201 },
                    ),
                )

                await expect(createProof(DOCUMENT_HASH)).rejects.toThrow(
                    'The server returned an unexpected proof response.',
                )
            })
        },
    )
})