// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_FILE_SIZE_BYTES, sha256 } from './sha256'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('sha256', () => {
    it.each([
        {
            name: 'an empty file',
            content: '',
            expected:
                'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        {
            name: 'a file containing abc',
            content: 'abc',
            expected:
                'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        },
    ])('should hash $name', async ({ content, expected }) => {
        const file = new File([content], 'document.txt')

        const result = await sha256(file)

        expect(result).toBe(expected)
        expect(result).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should accept a file exactly at the size limit', async () => {
        const contents = new Uint8Array(MAX_FILE_SIZE_BYTES)
        const file = new File([contents], 'limit.bin')

        const result = await sha256(file)

        // SHA-256 of 10 MiB of zero bytes.
        expect(result).toBe(
            'e5b844cc57f57094ea4585e235f36c78c1cd222262bb89d53c94dcb4d6b3e55d',
        )
    })

    it('should reject an oversized file before reading it', async () => {
        const file = new File([], 'oversized.bin')

        // Simulate the size without allocating an oversized document.
        Object.defineProperty(file, 'size', {
            value: MAX_FILE_SIZE_BYTES + 1,
        })

        const readFile = vi.spyOn(file, 'arrayBuffer')

        await expect(sha256(file)).rejects.toThrow(RangeError)

        expect(readFile).not.toHaveBeenCalled()
    })

    it('should reject when Web Crypto is unavailable', async () => {
        const file = new File(['abc'], 'document.txt')
        const readFile = vi.spyOn(file, 'arrayBuffer')

        vi.stubGlobal('crypto', undefined)

        await expect(sha256(file)).rejects.toThrow(
            'Secure browser hashing is unavailable.',
        )

        expect(readFile).not.toHaveBeenCalled()
    })

    it('should propagate a file reading failure', async () => {
        const file = new File(['abc'], 'document.txt')
        const failure = new Error('Cannot read the file')

        vi.spyOn(file, 'arrayBuffer').mockRejectedValue(failure)

        await expect(sha256(file)).rejects.toBe(failure)
    })

    it('should propagate a hashing failure', async () => {
        const file = new File(['abc'], 'document.txt')
        const failure = new Error('Cannot calculate the digest')

        vi.spyOn(globalThis.crypto.subtle, 'digest')
            .mockRejectedValue(failure)

        await expect(sha256(file)).rejects.toBe(failure)
    })
})