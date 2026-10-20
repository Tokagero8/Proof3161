// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { createProof } from './api/proofs'
import type { ProofResponse } from './api/proofs'
import { verifyProof } from './api/verifications'
import { readPortableProof } from './lib/portableProof'
import type { PortableProof } from './lib/portableProof'
import { sha256 } from './lib/sha256'

vi.mock('./api/proofs', () => ({
    createProof: vi.fn(),
}))

vi.mock('./api/verifications', () => ({
    verifyProof: vi.fn(),
}))

vi.mock('./lib/sha256', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./lib/sha256')>()
    return { ...actual, sha256: vi.fn() }
})

vi.mock('./lib/portableProof', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./lib/portableProof')>()
    return { ...actual, readPortableProof: vi.fn() }
})

const CREATED_HASH = 'a'.repeat(64)
const VERIFICATION_HASH = 'b'.repeat(64)

const PROOF: ProofResponse = {
    id: 'adfe140a-0bce-45b6-8bd7-ed652714c314',
    hashAlgorithm: 'SHA256',
    documentHash: CREATED_HASH,
    timestampAt: '2026-10-17T12:00:00Z',
    timestampTokenBase64: 'AQIDBA==',
    createdAt: '2026-10-17T12:00:01Z',
}

const RECEIPT: PortableProof = {
    version: '1',
    hashAlgorithm: 'SHA256',
    documentHash: PROOF.documentHash,
    timestampAt: PROOF.timestampAt,
    timestampTokenBase64: PROOF.timestampTokenBase64,
}

beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(sha256).mockResolvedValue(CREATED_HASH)
    vi.mocked(createProof).mockResolvedValue(PROOF)
    vi.mocked(readPortableProof).mockResolvedValue(RECEIPT)
    vi.mocked(verifyProof).mockResolvedValue({
        status: 'INVALID',
        reason: 'DOCUMENT_HASH_MISMATCH',
        timestampAt: null,
    })
})

afterEach(() => {
    cleanup()
})

describe('App verification integration', () => {
    it('provides navigation and keeps proof creation independent from verification', async () => {
        const user = userEvent.setup()

        render(<App />)

        expect(
            screen.getByRole('link', { name: 'Verify receipt' }),
        ).toHaveAttribute('href', '#verify-receipt')

        const verificationSection = screen.getByRole('region', {
            name: 'Verify receipt',
        })

        expect(verificationSection).toHaveAttribute('id', 'verify-receipt')

        await user.upload(
            screen.getByLabelText('Select a file', {
                selector: 'input[type="file"]',
            }),
            new File(['document for creation'], 'created.txt'),
        )

        const createButton = screen.getByRole('button', {
            name: 'Create proof',
        })

        await waitFor(() => {
            expect(createButton).toBeEnabled()
        })

        await user.click(createButton)

        const downloadLink = await screen.findByRole('link', {
            name: 'Download .proof.json',
        })

        expect(downloadLink).toHaveAttribute(
            'href',
            `/api/v1/proofs/${PROOF.id}/receipt`,
        )

        vi.mocked(sha256).mockResolvedValueOnce(VERIFICATION_HASH)

        const verification = within(verificationSection)

        await user.upload(
            verification.getByLabelText('Original document for verification'),
            new File(['different document'], 'verify.txt'),
        )

        await user.upload(
            verification.getByLabelText('Portable proof receipt (.proof.json)'),
            new File([JSON.stringify(RECEIPT)], 'receipt.proof.json', {
                type: 'application/json',
            }),
        )

        const verifyButton = verification.getByRole('button', {
            name: 'Verify receipt',
        })

        await waitFor(() => {
            expect(verifyButton).toBeEnabled()
        })

        await user.click(verifyButton)

        expect(
            await verification.findByRole('heading', {
                name: 'INVALID: Verification failed',
            }),
        ).toBeInTheDocument()

        expect(createProof).toHaveBeenCalledExactlyOnceWith(CREATED_HASH)
        expect(verifyProof).toHaveBeenCalledExactlyOnceWith(
            VERIFICATION_HASH,
            RECEIPT,
            expect.any(AbortSignal),
        )

        expect(screen.getByText(PROOF.id)).toBeInTheDocument()
        expect(downloadLink).toBeInTheDocument()
        expect(screen.getByLabelText('Calculated SHA-256 hash'))
            .toHaveTextContent(CREATED_HASH)
    })
})