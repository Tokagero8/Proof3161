// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
    getBase64DecodedLength,
    isObject,
    isSha256,
    isUtcTimestamp,
} from './validation'

describe('isObject', () => {
    it.each([
        { value: {}, expected: true },
        { value: { version: '1' }, expected: true },
        { value: null, expected: false },
        { value: undefined, expected: false },
        { value: [], expected: false },
        { value: 'receipt', expected: false },
        { value: 1, expected: false },
        { value: true, expected: false },
    ])('classifies $value', ({ value, expected }) => {
        expect(isObject(value)).toBe(expected)
    })
})

describe('isSha256', () => {
    it.each([
        'a'.repeat(64),
        'A'.repeat(64),
        '0123456789abcdef'.repeat(4),
    ])('accepts %s', value => {
        expect(isSha256(value)).toBe(true)
    })

    it.each([
        null,
        undefined,
        123,
        '',
        'a'.repeat(63),
        'a'.repeat(65),
        'g'.repeat(64),
        `${'a'.repeat(64)}\n`,
        ` ${'a'.repeat(64)}`,
    ])('rejects %j', value => {
        expect(isSha256(value)).toBe(false)
    })
})

describe('isUtcTimestamp', () => {
    it.each([
        '2026-10-17T10:16:54Z',
        '2026-10-17T10:16:54.1Z',
        '2026-10-17T10:16:54.123Z',
        '2026-10-17T10:16:54.123456Z',
        '2026-10-17T10:16:54.123456789Z',
        '2024-02-29T00:00:00Z',
        '2000-02-29T23:59:59Z',
    ])('accepts %s', value => {
        expect(isUtcTimestamp(value)).toBe(true)
    })

    it.each([
        null,
        undefined,
        2026,
        '',
        '2026',
        '2026-10-17',
        '2026-10-17 10:16:54Z',
        '2026-10-17T10:16:54',
        '2026-10-17T10:16:54+00:00',
        '2026-10-17T10:16:54z',
        '2026-02-29T10:16:54Z',
        '2026-02-30T10:16:54Z',
        '1900-02-29T10:16:54Z',
        '2026-13-17T10:16:54Z',
        '2026-10-00T10:16:54Z',
        '2026-10-17T24:00:00Z',
        '2026-10-17T10:60:54Z',
        '2026-10-17T10:16:60Z',
        '2026-10-17T10:16:54.Z',
        '2026-10-17T10:16:54.1234567890Z',
        '2026-10-17T10:16:54Z\n',
    ])('rejects %j', value => {
        expect(isUtcTimestamp(value)).toBe(false)
    })
})

describe('getBase64DecodedLength', () => {
    it.each([
        { value: 'Zg==', length: 1 },
        { value: 'Zg', length: 1 },
        { value: 'Zm8=', length: 2 },
        { value: 'Zm8', length: 2 },
        { value: 'Zm9v', length: 3 },
        { value: 'AQIDBA==', length: 4 },
        { value: 'AQIDBA', length: 4 },
        { value: '+/8=', length: 2 },
        // Java's decoder does not require unused padding bits to be zero.
        { value: 'Zh==', length: 1 },
        { value: 'Zh', length: 1 },
    ])('accepts $value', ({ value, length }) => {
        expect(getBase64DecodedLength(value)).toBe(length)
    })

    it.each([
        null,
        undefined,
        123,
        '',
        ' ',
        'A',
        'AAAAA',
        '=',
        '====',
        'AA=',
        'AA===',
        'AAA==',
        'AAAA=',
        'AA==AA',
        'A=AA',
        'AA-_',
        'AA==\n',
        'AA ==',
        '%%%',
    ])('rejects %j', value => {
        expect(getBase64DecodedLength(value)).toBeNull()
    })
})