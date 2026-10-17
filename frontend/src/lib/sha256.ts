export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export async function sha256(file: File): Promise<string> {
    if(file.size > MAX_FILE_SIZE_BYTES) {
        throw new RangeError('The file must not exceed 10 MiB.')
    }

    const subtle = globalThis.crypto?.subtle

    if (!subtle) {
        throw new Error('Secure browser hashing is unavailable.')
    }

    const contents = await file.arrayBuffer()
    const digest = await subtle.digest('SHA-256', contents)

    return Array.from(
        new Uint8Array(digest),
        byte => byte.toString(16).padStart(2, '0'),
    ).join('')
}