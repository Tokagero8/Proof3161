// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableProof } from '../lib/portableProof'
import {
    VERIFICATION_TIMEOUT_MS,
    verifyProof,
} from './verifications'
import type { VerificationResponse } from './verifications'

const DOCUMENT_HASH = 'a'.repeat(64)
const DIFFERENT_DOCUMENT_HASH = 'b'.repeat(64)

const RECEIPT: PortableProof = {
    version: '1',
    hashAlgorithm: 'SHA256',
    documentHash: DOCUMENT_HASH,
    timestampAt: '2026-10-17T10:16:54.123456789Z',
    timestampTokenBase64: 'AQIDBA==',
}

const VALID_RESULT: VerificationResponse = {
    status: 'VALID',
    reason: 'VERIFIED',
    timestampAt: RECEIPT.timestampAt,
}

const INVALID_RESULT: VerificationResponse = {
    status: 'INVALID',
    reason: 'DOCUMENT_HASH_MISMATCH',
    timestampAt: null,
}

const INDETERMINATE_RESULT: VerificationResponse = {
    status: 'INDETERMINATE',
    reason: 'TRUST_NOT_ESTABLISHED',
    timestampAt: null,
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

function submittedSignal(): AbortSignal {
    const signal = fetchMock.mock.calls[0]?.[1]?.signal

    if (!signal) {
        throw new Error('Expected an AbortSignal on the verification request')
    }

    return signal
}

function stallRequest(stage: 'fetch' | 'body'): void {
    if (stage === 'fetch') {
        fetchMock.mockImplementation(
            () => new Promise<Response>(() => undefined),
        )
        return
    }

    const response = Response.json(VALID_RESULT)

    vi.spyOn(response, 'json').mockImplementation(
        () => new Promise<never>(() => undefined),
    )

    fetchMock.mockResolvedValue(response)
}

describe('verifyProof', () => {
    it('sends the independent hash separately and strips extra receipt fields', async () => {
        const suppliedReceipt = {
            ...RECEIPT,
            filename: 'private-document.txt',
            id: 'unneeded-database-id',
        }

        fetchMock.mockResolvedValue(Response.json(INVALID_RESULT))

        await expect(
            verifyProof(DIFFERENT_DOCUMENT_HASH, suppliedReceipt),
        ).resolves.toEqual(INVALID_RESULT)

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            '/api/v1/verifications',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    documentHash: DIFFERENT_DOCUMENT_HASH,
                    portableProof: RECEIPT,
                }),
                signal: expect.any(AbortSignal),
            },
        )
    })

    it.each([
        VALID_RESULT,
        INVALID_RESULT,
        INDETERMINATE_RESULT,
    ])('preserves the $status verdict', async result => {
        fetchMock.mockResolvedValue(Response.json(result))

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).resolves.toEqual(result)

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('preserves an unknown reason for a recognized non-valid status', async () => {
        const result = {
            status: 'INDETERMINATE',
            reason: 'FUTURE_VERIFICATION_REASON',
            timestampAt: null,
        }

        fetchMock.mockResolvedValue(Response.json(result))

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).resolves.toEqual(result)
    })

    it('rejects an invalid independent hash without making a request', async () => {
        await expect(
            verifyProof(`${DOCUMENT_HASH}\n`, RECEIPT),
        ).rejects.toMatchObject({
            name: 'VerificationRequestError',
            code: 'INPUT',
        })

        expect(fetchMock).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('revalidates the receipt before making a request', async () => {
        await expect(
            verifyProof(DOCUMENT_HASH, {
                ...RECEIPT,
                timestampTokenBase64: '%%%',
            }),
        ).rejects.toMatchObject({
            code: 'INPUT',
        })

        expect(fetchMock).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })

    it.each([400, 500, 502])('reports HTTP %i as a request error', async status => {
        const detail = 'Verification request could not be processed.'

        fetchMock.mockResolvedValue(
            Response.json({ status, detail }, { status }),
        )

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'HTTP',
            status,
            message: detail,
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('handles an HTTP error with a non-JSON body', async () => {
        fetchMock.mockResolvedValue(
            new Response('Bad Gateway', { status: 502 }),
        )

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'HTTP',
            status: 502,
            message: 'Verification request failed (HTTP 502).',
        })
    })

    it('handles an HTTP error without a useful problem detail', async () => {
        fetchMock.mockResolvedValue(
            Response.json({ detail: '   ' }, { status: 400 }),
        )

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'HTTP',
            status: 400,
            message: 'Verification request failed (HTTP 400).',
        })
    })

    it('rejects a successful response containing invalid JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('not JSON', { status: 200 }),
        )

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'INVALID_RESPONSE',
        })
    })

    it('rejects an unexpected successful HTTP status', async () => {
        fetchMock.mockResolvedValue(
            Response.json(VALID_RESULT, { status: 201 }),
        )

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'INVALID_RESPONSE',
        })
    })

    it.each([
        { body: null },
        { body: [] },
        { body: {} },
        { body: { ...VALID_RESULT, status: 'UNKNOWN' } },
        { body: { ...VALID_RESULT, reason: 'DOCUMENT_HASH_MISMATCH' } },
        { body: { ...VALID_RESULT, timestampAt: null } },
        { body: { ...VALID_RESULT, timestampAt: '2026' } },
        { body: { ...INVALID_RESULT, timestampAt: RECEIPT.timestampAt } },
        { body: { ...INVALID_RESULT, reason: 'VERIFIED' } },
        { body: { ...INVALID_RESULT, reason: '   ' } },
        { body: { ...INDETERMINATE_RESULT, timestampAt: undefined } },
    ])('rejects an inconsistent response: $body', async ({ body }) => {
        fetchMock.mockResolvedValue(Response.json(body))

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'INVALID_RESPONSE',
        })
    })

    it('reports network failure without retrying', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'NETWORK',
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('reports failure while reading the response body', async () => {
        const response = Response.json(VALID_RESULT)

        vi.spyOn(response, 'json').mockRejectedValue(
            new TypeError('Connection closed'),
        )
        fetchMock.mockResolvedValue(response)

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT),
        ).rejects.toMatchObject({
            code: 'NETWORK',
        })
    })

    it('does not send a request when already cancelled', async () => {
        const controller = new AbortController()
        controller.abort()

        await expect(
            verifyProof(DOCUMENT_HASH, RECEIPT, controller.signal),
        ).rejects.toMatchObject({
            code: 'CANCELLED',
        })

        expect(fetchMock).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })

    it.each(['fetch', 'body'] as const)(
        'supports cancellation during %s',
        async stage => {
            stallRequest(stage)

            const controller = new AbortController()
            const pending = verifyProof(
                DOCUMENT_HASH,
                RECEIPT,
                controller.signal,
            )

            const assertion = expect(pending).rejects.toMatchObject({
                code: 'CANCELLED',
            })

            // Allow fetch to resolve and body reading to begin in the body case.
            await vi.advanceTimersByTimeAsync(0)
            controller.abort()

            await assertion

            expect(submittedSignal().aborted).toBe(true)
            expect(fetchMock).toHaveBeenCalledTimes(1)
            expect(vi.getTimerCount()).toBe(0)
        },
    )

    it.each(['fetch', 'body'] as const)(
        'enforces the timeout during %s',
        async stage => {
            stallRequest(stage)

            const pending = verifyProof(DOCUMENT_HASH, RECEIPT)
            const assertion = expect(pending).rejects.toMatchObject({
                code: 'TIMEOUT',
            })

            await vi.advanceTimersByTimeAsync(VERIFICATION_TIMEOUT_MS)
            await assertion

            expect(submittedSignal().aborted).toBe(true)
            expect(fetchMock).toHaveBeenCalledTimes(1)
            expect(vi.getTimerCount()).toBe(0)
        },
    )

    it('removes the caller cancellation listener after success', async () => {
        const controller = new AbortController()
        const removeListener = vi.spyOn(
            controller.signal,
            'removeEventListener',
        )

        fetchMock.mockResolvedValue(Response.json(VALID_RESULT))

        await verifyProof(DOCUMENT_HASH, RECEIPT, controller.signal)

        expect(removeListener).toHaveBeenCalledWith(
            'abort',
            expect.any(Function),
        )
        expect(vi.getTimerCount()).toBe(0)

        controller.abort()

        // A later caller cancellation must not affect the completed request.
        expect(submittedSignal().aborted).toBe(false)
    })
})