// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileSelector } from './FileSelector'

afterEach(() => {
    cleanup()
})

describe('FileSelector', () => {
    it('preserves the default label and allows selecting the same file again', async () => {
        const user = userEvent.setup()
        const onFileSelect = vi.fn()
        const file = new File(['document'], 'document.txt')

        render(<FileSelector onFileSelect={onFileSelect} />)

        const input = screen.getByLabelText('Select a file')

        await user.upload(input, file)
        await user.upload(input, file)

        expect(onFileSelect).toHaveBeenCalledTimes(2)
        expect(onFileSelect).toHaveBeenNthCalledWith(1, file)
        expect(onFileSelect).toHaveBeenNthCalledWith(2, file)
        expect(input).toHaveValue('')
    })

    it('supports a custom label, picker hint, and accessible description', () => {
        render(
            <>
                <FileSelector
                    label="Choose a receipt"
                    accept=".json,application/json"
                    describedBy="receipt-help"
                    invalid
                    onFileSelect={vi.fn()}
                />
                <p id="receipt-help">Choose a valid JSON receipt.</p>
            </>,
        )

        const input = screen.getByLabelText('Choose a receipt')

        expect(input).toHaveAttribute('accept', '.json,application/json')
        expect(input).toHaveAccessibleDescription('Choose a valid JSON receipt.')
        expect(input).toHaveAttribute('aria-invalid', 'true')
    })

    it('does not select files while disabled', async () => {
        const user = userEvent.setup()
        const onFileSelect = vi.fn()

        render(<FileSelector onFileSelect={onFileSelect} disabled />)

        const input = screen.getByLabelText('Select a file')

        await user.upload(input, new File(['document'], 'document.txt'))

        expect(input).toBeDisabled()
        expect(onFileSelect).not.toHaveBeenCalled()
    })

    it('ignores an empty selection', () => {
        const onFileSelect = vi.fn()

        render(<FileSelector onFileSelect={onFileSelect} />)

        fireEvent.change(screen.getByLabelText('Select a file'), {
            target: { files: [] },
        })

        expect(onFileSelect).not.toHaveBeenCalled()
    })
})