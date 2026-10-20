// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { VerificationResponse } from '../api/verifications'
import { VerificationResult } from './VerificationResult'

afterEach(() => {
    cleanup()
})

const reasonCases: Array<{
    status: 'INVALID' | 'INDETERMINATE'
    reason: string
    explanation: RegExp
}> = [
    {
        status: 'INVALID',
        reason: 'DOCUMENT_HASH_MISMATCH',
        explanation: /selected document does not match/,
    },
    {
        status: 'INVALID',
        reason: 'RECEIPT_METADATA_MISMATCH',
        explanation: /receipt hash or timestamp does not match/,
    },
    {
        status: 'INVALID',
        reason: 'MALFORMED_TOKEN',
        explanation: /could not be read as a valid RFC 3161 token/,
    },
    {
        status: 'INVALID',
        reason: 'INVALID_TOKEN',
        explanation: /failed signature or signing-certificate validation/,
    },
    {
        status: 'INVALID',
        reason: 'CERTIFICATE_REVOKED',
        explanation: /reported revoked/,
    },
    {
        status: 'INDETERMINATE',
        reason: 'SIGNER_CERTIFICATE_UNAVAILABLE',
        explanation: /certificate needed to verify the timestamp signature was unavailable/,
    },
    {
        status: 'INDETERMINATE',
        reason: 'UNSUPPORTED_ALGORITHM',
        explanation: /does not support an algorithm/,
    },
    {
        status: 'INDETERMINATE',
        reason: 'TRUST_NOT_ESTABLISHED',
        explanation: /could not establish certificate trust/,
    },
    {
        status: 'INDETERMINATE',
        reason: 'VERIFICATION_UNAVAILABLE',
        explanation: /source of verification evidence was unavailable/,
    },
]

describe('VerificationResult', () => {
    it('displays a valid result and preserves the verified timestamp precision', () => {
        const result: VerificationResponse = {
            status: 'VALID',
            reason: 'VERIFIED',
            timestampAt: '2026-10-17T12:00:00.123456789Z',
        }

        render(<VerificationResult result={result} />)

        expect(
            screen.getByRole('heading', {
                name: 'VALID: Verification succeeded',
            }),
        ).toBeInTheDocument()

        expect(
            screen.getByText(
                "Verification succeeded under the server's configured trust policy.",
            ),
        ).toBeInTheDocument()

        expect(screen.getByText(result.timestampAt)).toHaveAttribute(
            'datetime',
            result.timestampAt,
        )
    })

    it.each(reasonCases)(
        'explains $status / $reason without displaying a verified timestamp',
        ({ status, reason, explanation }) => {
            const { container } = render(
                <VerificationResult
                    result={{ status, reason, timestampAt: null }}
                />,
            )

            expect(
                screen.getByRole('heading', {
                    name: new RegExp(`^${status}:`),
                }),
            ).toBeInTheDocument()

            expect(screen.getByText(explanation)).toBeInTheDocument()
            expect(screen.getByText(reason)).toBeInTheDocument()
            expect(container.querySelector('time')).toBeNull()

            if (status === 'INDETERMINATE') {
                expect(
                    screen.getByText(
                        'This does not automatically mean the document or receipt was falsified.',
                    ),
                ).toBeInTheDocument()
            }
        },
    )

    it.each(['INVALID', 'INDETERMINATE'] as const)(
        'keeps an unfamiliar reason separate from the %s verdict',
        (status) => {
            const reason = '<img src=x onerror=alert(1)>'

            const { container } = render(
                <VerificationResult
                    result={{ status, reason, timestampAt: null }}
                />,
            )

            expect(
                screen.getByRole('heading', {
                    name: new RegExp(`^${status}:`),
                }),
            ).toBeInTheDocument()

            expect(screen.getByText(/unfamiliar reason/)).toBeInTheDocument()
            expect(screen.getByText(reason)).toBeInTheDocument()
            expect(container.querySelector('img')).toBeNull()
            expect(container.querySelector('time')).toBeNull()
        },
    )
})