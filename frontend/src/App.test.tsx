// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import {
    act,
    cleanup,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { createProof } from './api/proofs'
import type { ProofResponse } from './api/proofs'
import { sha256 } from './lib/sha256'

vi.mock('./api/proofs', () => ({
    createProof: vi.fn(),
}))

vi.mock('./lib/sha256', () => ({
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    sha256: vi.fn(),
}))

const DOCUMENT_HASH = 'a'.repeat(64)

const PROOF: ProofResponse = {
    id: 'adfe140a-0bce-45b6-8bd7-ed652714c314',
    hashAlgorithm: 'SHA256',
    documentHash: DOCUMENT_HASH,
    timestampAt: '2026-10-17T12:00:00Z',
    timestampTokenBase64: 'AQIDBA==',
    createdAt: '2026-10-17T12:00:01Z',
}

const sha256Mock = vi.mocked(sha256)
const createProofMock = vi.mocked(createProof)

beforeEach(() => {
    vi.resetAllMocks()
    sha256Mock.mockResolvedValue(DOCUMENT_HASH)
})

afterEach(() => {
    cleanup()
})

async function selectDocument() {
    const user = userEvent.setup()

    render(<App />)

    await user.upload(
        screen.getByLabelText('Select a file', {
            selector: 'input[type="file"]',
        }),
        new File(['document contents'], 'document.txt'),
    )

    await waitFor(() => {
        expect(
            screen.getByLabelText('Calculated SHA-256 hash'),
        ).toHaveTextContent(DOCUMENT_HASH)
    })

    return user
}

describe('proof creation', () => {
    it('does not submit the hash automatically', async () => {
        await selectDocument()

        expect(createProofMock).not.toHaveBeenCalled()
        expect(
            screen.getByRole('button', { name: 'Create proof' }),
        ).toBeEnabled()
    })

    it('submits the calculated hash and displays the created proof', async () => {
        createProofMock.mockResolvedValue(PROOF)

        const user = await selectDocument()

        await user.click(
            screen.getByRole('button', { name: 'Create proof' }),
        )

        expect(await screen.findByText(PROOF.id)).toBeInTheDocument()
        expect(screen.getByText(PROOF.timestampAt)).toBeInTheDocument()

        expect(createProofMock).toHaveBeenCalledExactlyOnceWith(
            DOCUMENT_HASH,
        )
    })

    it('disables submission and file selection while creating a proof', async () => {
        let resolveProof!: (proof: ProofResponse) => void

        createProofMock.mockReturnValue(
            new Promise<ProofResponse>(resolve => {
                resolveProof = resolve
            }),
        )

        const user = await selectDocument()

        await user.click(
            screen.getByRole('button', { name: 'Create proof' }),
        )

        const pendingButton = screen.getByRole('button', {
            name: 'Creating proof…',
        })

        expect(pendingButton).toBeDisabled()
        expect(
            screen.getByLabelText('Select a file', {
                selector: 'input[type="file"]',
            })
        ).toBeDisabled()

        await user.click(pendingButton)
        expect(createProofMock).toHaveBeenCalledTimes(1)

        await act(async () => {
            resolveProof(PROOF)
        })

        expect(screen.getByText(PROOF.id)).toBeInTheDocument()
        expect(
            screen.getByLabelText('Select a file', {
                selector: 'input[type="file"]',
            })
        ).toBeEnabled()
    })

    it('keeps the hash visible when proof creation fails', async () => {
        createProofMock.mockRejectedValue(
            new Error('The timestamp authority is unavailable.'),
        )

        const user = await selectDocument()

        await user.click(
            screen.getByRole('button', { name: 'Create proof' }),
        )

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The timestamp authority is unavailable.',
        )

        expect(
            screen.getByLabelText('Calculated SHA-256 hash'),
        ).toHaveTextContent(DOCUMENT_HASH)

        expect(
            screen.getByRole('button', { name: 'Create proof' }),
        ).toBeEnabled()
    })

    it('clears the previous proof when another file is selected', async () => {
        createProofMock.mockResolvedValue(PROOF)

        const user = await selectDocument()

        await user.click(
            screen.getByRole('button', { name: 'Create proof' }),
        )

        expect(await screen.findByText(PROOF.id)).toBeInTheDocument()

        const nextHash = 'b'.repeat(64)
        sha256Mock.mockResolvedValueOnce(nextHash)

        await user.upload(
            screen.getByLabelText('Select a file', {
                selector: 'input[type="file"]',
            }),
            new File(['another document'], 'another.txt'),
        )

        await waitFor(() => {
            expect(
                screen.getByLabelText('Calculated SHA-256 hash'),
            ).toHaveTextContent(nextHash)
        })

        expect(screen.queryByText(PROOF.id)).not.toBeInTheDocument()

        expect(
            screen.queryByRole('link', { name: 'Download .proof.json' }),
        ).not.toBeInTheDocument()

        expect(
            screen.getByRole('button', { name: 'Create proof' }),
        ).toBeEnabled()

        expect(createProofMock).toHaveBeenCalledTimes(1)
    })

    it('offers a receipt download after creating a proof', async () => {
        createProofMock.mockResolvedValue(PROOF)

        const user = await selectDocument()

        expect(
            screen.queryByRole('link', { name: 'Download .proof.json' }),
        ).not.toBeInTheDocument()

        await user.click(
            screen.getByRole('button', { name: 'Create proof' }),
        )

        const link = await screen.findByRole('link', {
            name: 'Download .proof.json',
        })

        expect(link).toHaveAttribute(
            'href',
            `/api/v1/proofs/${PROOF.id}/receipt`,
        )
    })
})