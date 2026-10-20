// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import {
    act,
    cleanup,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    VerificationRequestError,
    verifyProof,
} from '../api/verifications'
import type { VerificationResponse } from '../api/verifications'
import { readPortableProof } from '../lib/portableProof'
import type { PortableProof } from '../lib/portableProof'
import { sha256 } from '../lib/sha256'
import { VerifyReceipt } from './VerifyReceipt'

vi.mock('../lib/sha256', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/sha256')>()
    return { ...actual, sha256: vi.fn() }
})

vi.mock('../lib/portableProof', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/portableProof')>()
    return { ...actual, readPortableProof: vi.fn() }
})

vi.mock('../api/verifications', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../api/verifications')>()
    return { ...actual, verifyProof: vi.fn() }
})

const DOCUMENT_HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)

const RECEIPT: PortableProof = {
    version: '1',
    hashAlgorithm: 'SHA256',
    documentHash: DOCUMENT_HASH,
    timestampAt: '2026-10-17T12:00:00Z',
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

const sha256Mock = vi.mocked(sha256)
const readReceiptMock = vi.mocked(readPortableProof)
const verifyProofMock = vi.mocked(verifyProof)

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void

    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, resolve, reject }
}

function documentInput() {
    return screen.getByLabelText('Original document for verification')
}

function receiptInput() {
    return screen.getByLabelText('Portable proof receipt (.proof.json)')
}

function verificationButton() {
    return screen.getByRole('button', {
        name: /^(Verify receipt|Verifying receipt…|Retry verification)$/,
    })
}

function documentFile(name = 'original.txt') {
    return new File(['private document bytes'], name, {
        type: 'text/plain',
    })
}

function receiptFile(name = 'receipt.proof.json') {
    return new File([JSON.stringify(RECEIPT)], name, {
        type: 'application/json',
    })
}

function renderComponent() {
    const user = userEvent.setup()
    const view = render(
        <StrictMode>
            <VerifyReceipt />
        </StrictMode>,
    )

    return { user, ...view }
}

async function prepareInputs() {
    const view = renderComponent()

    await view.user.upload(documentInput(), documentFile())
    await view.user.upload(receiptInput(), receiptFile())

    await waitFor(() => {
        expect(verificationButton()).toBeEnabled()
    })

    return view
}

beforeEach(() => {
    vi.resetAllMocks()
    sha256Mock.mockResolvedValue(DOCUMENT_HASH)
    readReceiptMock.mockResolvedValue(RECEIPT)
    verifyProofMock.mockResolvedValue(VALID_RESULT)
})

afterEach(() => {
    cleanup()
})

describe('VerifyReceipt', () => {
    it('starts empty and does not make requests', () => {
        renderComponent()

        expect(screen.getByText('No document selected.')).toBeInTheDocument()
        expect(screen.getByText('No receipt selected.')).toBeInTheDocument()
        expect(documentInput()).toBeEnabled()
        expect(receiptInput()).toBeEnabled()
        expect(verificationButton()).toBeDisabled()

        expect(sha256Mock).not.toHaveBeenCalled()
        expect(readReceiptMock).not.toHaveBeenCalled()
        expect(verifyProofMock).not.toHaveBeenCalled()
    })

    it('hashes the selected document locally and waits for a receipt', async () => {
        const hashing = deferred<string>()
        sha256Mock.mockReturnValueOnce(hashing.promise)

        const { user } = renderComponent()
        const file = documentFile()

        await user.upload(documentInput(), file)

        expect(sha256Mock).toHaveBeenCalledExactlyOnceWith(file)
        expect(screen.getByText(/Calculating SHA-256 for original.txt/))
            .toBeInTheDocument()
        expect(verificationButton()).toBeDisabled()

        await act(async () => {
            hashing.resolve(DOCUMENT_HASH)
        })

        expect(screen.getByLabelText('Verification document SHA-256'))
            .toHaveTextContent(DOCUMENT_HASH)
        expect(verificationButton()).toBeDisabled()
        expect(verifyProofMock).not.toHaveBeenCalled()
    })

    it('reads and presents receipt metadata without starting verification', async () => {
        const reading = deferred<PortableProof>()
        readReceiptMock.mockReturnValueOnce(reading.promise)

        const { user } = renderComponent()
        const file = receiptFile()

        await user.upload(receiptInput(), file)

        expect(readReceiptMock).toHaveBeenCalledExactlyOnceWith(file)
        expect(screen.getByText(/Reading receipt receipt.proof.json/))
            .toBeInTheDocument()
        expect(verificationButton()).toBeDisabled()

        await act(async () => {
            reading.resolve(RECEIPT)
        })

        expect(screen.getByText('Receipt structure checked.')).toBeInTheDocument()
        expect(screen.getByText(RECEIPT.documentHash)).toBeInTheDocument()
        expect(screen.getByText(RECEIPT.timestampAt)).toBeInTheDocument()
        expect(screen.getByText('Receipt timestamp — unverified metadata'))
            .toBeInTheDocument()
        expect(verificationButton()).toBeDisabled()
        expect(verifyProofMock).not.toHaveBeenCalled()
    })

    it.each([
        'The file must not exceed 10 MiB.',
        'Secure browser hashing is unavailable.',
    ])('reports a hashing error: %s', async (message) => {
        sha256Mock.mockRejectedValueOnce(new Error(message))

        const { user } = renderComponent()
        await user.upload(documentInput(), documentFile())

        expect(await screen.findByRole('alert')).toHaveTextContent(message)
        expect(documentInput()).toHaveAttribute('aria-invalid', 'true')
        expect(verificationButton()).toBeDisabled()
        expect(verifyProofMock).not.toHaveBeenCalled()
    })

    it.each([
        'The receipt file does not contain valid JSON.',
        'Only portable proof version "1" is supported.',
        'The receipt file must not exceed 128 KiB.',
    ])('reports a receipt input error: %s', async (message) => {
        readReceiptMock.mockRejectedValueOnce(new Error(message))

        const { user } = renderComponent()
        await user.upload(receiptInput(), receiptFile())

        expect(await screen.findByRole('alert')).toHaveTextContent(message)
        expect(receiptInput()).toHaveAttribute('aria-invalid', 'true')
        expect(verificationButton()).toBeDisabled()
        expect(verifyProofMock).not.toHaveBeenCalled()
    })

    it('requires an explicit click after both inputs become ready', async () => {
        const { user } = await prepareInputs()

        expect(verifyProofMock).not.toHaveBeenCalled()
        expect(verificationButton()).toBeEnabled()

        await user.click(verificationButton())

        expect(
            await screen.findByRole('heading', {
                name: 'VALID: Verification succeeded',
            }),
        ).toBeInTheDocument()

        expect(verifyProofMock).toHaveBeenCalledExactlyOnceWith(
            DOCUMENT_HASH,
            RECEIPT,
            expect.any(AbortSignal),
        )
    })

    it('submits an independent hash even when receipt metadata contains a different hash', async () => {
        const differentReceipt: PortableProof = {
            ...RECEIPT,
            documentHash: OTHER_HASH,
        }

        readReceiptMock.mockResolvedValueOnce(differentReceipt)
        verifyProofMock.mockResolvedValueOnce(INVALID_RESULT)

        const { user } = await prepareInputs()

        expect(verificationButton()).toBeEnabled()
        await user.click(verificationButton())

        expect(
            await screen.findByRole('heading', {
                name: 'INVALID: Verification failed',
            }),
        ).toBeInTheDocument()

        expect(verifyProofMock).toHaveBeenCalledExactlyOnceWith(
            DOCUMENT_HASH,
            differentReceipt,
            expect.any(AbortSignal),
        )
        expect(differentReceipt.documentHash).toBe(OTHER_HASH)
    })

    it.each([
        VALID_RESULT,
        INVALID_RESULT,
        INDETERMINATE_RESULT,
    ])('presents the returned $status verdict', async (result) => {
        verifyProofMock.mockResolvedValueOnce(result)

        const { user, container } = await prepareInputs()
        await user.click(verificationButton())

        expect(
            await screen.findByRole('heading', {
                name: new RegExp(`^${result.status}:`),
            }),
        ).toBeInTheDocument()

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()

        if (result.status === 'VALID') {
            expect(container.querySelector('time')).toHaveAttribute(
                'datetime',
                result.timestampAt,
            )
        } else {
            expect(container.querySelector('time')).toBeNull()
        }
    })

    it.each([
        new VerificationRequestError('HTTP', 'Request rejected.', 400),
        new VerificationRequestError('HTTP', 'Verification service unavailable.', 502),
        new VerificationRequestError('NETWORK', 'Unable to reach the verification service.'),
        new VerificationRequestError('TIMEOUT', 'Verification timed out.'),
        new VerificationRequestError('CANCELLED', 'Verification was cancelled.'),
        new VerificationRequestError('INVALID_RESPONSE', 'Unexpected verification response.'),
    ])('keeps $code failures separate from verdicts and allows an explicit retry', async (error) => {
        verifyProofMock
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce(VALID_RESULT)

        const { user } = await prepareInputs()
        await user.click(verificationButton())

        expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
        expect(screen.getByRole('alert')).toHaveTextContent(
            'No verification verdict is available.',
        )
        expect(
            screen.queryByRole('heading', {
                name: /^(VALID|INVALID|INDETERMINATE):/,
            }),
        ).not.toBeInTheDocument()

        expect(screen.getByLabelText('Verification document SHA-256'))
            .toHaveTextContent(DOCUMENT_HASH)
        expect(screen.getByText('receipt.proof.json')).toBeInTheDocument()
        expect(verifyProofMock).toHaveBeenCalledTimes(1)

        await user.click(
            screen.getByRole('button', { name: 'Retry verification' }),
        )

        expect(
            await screen.findByRole('heading', {
                name: 'VALID: Verification succeeded',
            }),
        ).toBeInTheDocument()

        expect(verifyProofMock).toHaveBeenNthCalledWith(
            2,
            DOCUMENT_HASH,
            RECEIPT,
            expect.any(AbortSignal),
        )
        expect(sha256Mock).toHaveBeenCalledTimes(1)
        expect(readReceiptMock).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('prevents duplicate requests and locks both inputs while pending', async () => {
        const request = deferred<VerificationResponse>()
        verifyProofMock.mockReturnValueOnce(request.promise)

        const { user } = await prepareInputs()
        await user.dblClick(verificationButton())

        expect(verifyProofMock).toHaveBeenCalledTimes(1)
        expect(verificationButton()).toBeDisabled()
        expect(documentInput()).toBeDisabled()
        expect(receiptInput()).toBeDisabled()

        await user.click(verificationButton())
        expect(verifyProofMock).toHaveBeenCalledTimes(1)

        await act(async () => {
            request.resolve(VALID_RESULT)
        })

        expect(documentInput()).toBeEnabled()
        expect(receiptInput()).toBeEnabled()
        expect(verificationButton()).toBeEnabled()
    })

    it.each(['document', 'receipt'] as const)(
        'clears the previous verdict immediately when the %s changes',
        async (input) => {
            const { user } = await prepareInputs()
            await user.click(verificationButton())

            expect(
                await screen.findByRole('heading', {
                    name: 'VALID: Verification succeeded',
                }),
            ).toBeInTheDocument()

            const hashing = deferred<string>()
            const reading = deferred<PortableProof>()

            if (input === 'document') {
                sha256Mock.mockReturnValueOnce(hashing.promise)
                await user.upload(documentInput(), documentFile('replacement.txt'))
            } else {
                readReceiptMock.mockReturnValueOnce(reading.promise)
                await user.upload(receiptInput(), receiptFile('replacement.proof.json'))
            }

            expect(
                screen.queryByRole('heading', {
                    name: 'VALID: Verification succeeded',
                }),
            ).not.toBeInTheDocument()
            expect(verificationButton()).toBeDisabled()

            await act(async () => {
                if (input === 'document') {
                    hashing.resolve(OTHER_HASH)
                } else {
                    reading.resolve(RECEIPT)
                }
            })

            expect(verificationButton()).toBeEnabled()
            expect(verifyProofMock).toHaveBeenCalledTimes(1)
        },
    )

    it.each(['resolve', 'reject'] as const)(
        'ignores an obsolete hashing operation that later %ss',
        async (completion) => {
            const oldHash = deferred<string>()
            const newHash = deferred<string>()

            sha256Mock
                .mockReturnValueOnce(oldHash.promise)
                .mockReturnValueOnce(newHash.promise)

            const { user } = renderComponent()

            await user.upload(receiptInput(), receiptFile())
            await user.upload(documentInput(), documentFile('old.txt'))
            expect(documentInput()).toBeEnabled()
            await user.upload(documentInput(), documentFile('new.txt'))

            await act(async () => {
                newHash.resolve(OTHER_HASH)
            })

            await act(async () => {
                if (completion === 'resolve') {
                    oldHash.resolve(DOCUMENT_HASH)
                } else {
                    oldHash.reject(new Error('Obsolete hashing error'))
                }
            })

            expect(screen.getByLabelText('Verification document SHA-256'))
                .toHaveTextContent(OTHER_HASH)
            expect(screen.getByText('new.txt')).toBeInTheDocument()
            expect(screen.queryByText('old.txt')).not.toBeInTheDocument()
            expect(screen.queryByRole('alert')).not.toBeInTheDocument()
            expect(verificationButton()).toBeEnabled()
        },
    )

    it.each(['resolve', 'reject'] as const)(
        'ignores an obsolete receipt read that later %ss',
        async (completion) => {
            const oldRead = deferred<PortableProof>()
            const newRead = deferred<PortableProof>()
            const newReceipt: PortableProof = {
                ...RECEIPT,
                documentHash: OTHER_HASH,
            }

            readReceiptMock
                .mockReturnValueOnce(oldRead.promise)
                .mockReturnValueOnce(newRead.promise)
            verifyProofMock.mockResolvedValueOnce(INVALID_RESULT)

            const { user } = renderComponent()

            await user.upload(documentInput(), documentFile())
            await user.upload(receiptInput(), receiptFile('old.proof.json'))
            expect(receiptInput()).toBeEnabled()
            await user.upload(receiptInput(), receiptFile('new.proof.json'))

            await act(async () => {
                newRead.resolve(newReceipt)
            })

            await act(async () => {
                if (completion === 'resolve') {
                    oldRead.resolve(RECEIPT)
                } else {
                    oldRead.reject(new Error('Obsolete receipt error'))
                }
            })

            expect(screen.getByText('new.proof.json')).toBeInTheDocument()
            expect(screen.queryByText('old.proof.json')).not.toBeInTheDocument()
            expect(screen.queryByRole('alert')).not.toBeInTheDocument()

            await user.click(verificationButton())

            expect(verifyProofMock).toHaveBeenCalledExactlyOnceWith(
                DOCUMENT_HASH,
                newReceipt,
                expect.any(AbortSignal),
            )
        },
    )

    it.each(['resolve', 'reject'] as const)(
        'aborts on unmount and ignores a request that subsequently %ss',
        async (completion) => {
            const request = deferred<VerificationResponse>()
            verifyProofMock.mockReturnValueOnce(request.promise)

            const { user, unmount } = await prepareInputs()
            await user.click(verificationButton())

            const signal = verifyProofMock.mock.calls[0]?.[2]

            expect(signal).toBeInstanceOf(AbortSignal)
            expect(signal?.aborted).toBe(false)

            unmount()

            expect(signal?.aborted).toBe(true)

            await act(async () => {
                if (completion === 'resolve') {
                    request.resolve(VALID_RESULT)
                } else {
                    request.reject(
                        new VerificationRequestError(
                            'CANCELLED',
                            'Verification was cancelled.',
                        ),
                    )
                }
            })

            expect(verifyProofMock).toHaveBeenCalledTimes(1)
        },
    )
})