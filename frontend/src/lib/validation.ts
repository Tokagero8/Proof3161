export function isObject(
    value: unknown,
): value is Record<string, unknown> {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
}

export function isSha256(value: unknown): value is string {
    return typeof value === 'string'
        && value.length === 64
        && /^[0-9a-fA-F]{64}$/.test(value)
}

export function isUtcTimestamp(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false
    }

    const match =
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?Z$/.exec(value)

    if (!match || match[0] !== value) {
        return false
    }

    // Validate calendar/time components without modifying the original value.
    const normalized = `${match[1]}.000Z`
    const date = new Date(normalized)

    return Number.isFinite(date.getTime())
        && date.toISOString() === normalized
}

/**
 * Returns the decoded length of nonempty standard Base64.
 * Returns null for invalid encoding.
 *
 * Supports padded and unpadded forms accepted by Java's basic decoder.
 * Does not require canonical unused padding bits.
 */
export function getBase64DecodedLength(value: unknown): number | null {
    if (
        typeof value !== 'string'
        || value.length === 0
        || /[^A-Za-z0-9+/=]/.test(value)
    ) {
        return null
    }

    const firstPadding = value.indexOf('=')
    const dataLength = firstPadding === -1
        ? value.length
        : firstPadding
    const paddingLength = value.length - dataLength

    if (dataLength === 0 || dataLength % 4 === 1) {
        return null
    }

    if (
        paddingLength > 0
        && (
            paddingLength > 2
            || value.length % 4 !== 0
            || value.slice(dataLength) !== '='.repeat(paddingLength)
        )
    ) {
        return null
    }

    return Math.floor(dataLength * 3 / 4)
}