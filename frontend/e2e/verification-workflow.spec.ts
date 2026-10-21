import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { expect, test as base } from '@playwright/test'
import type { Page, Request } from '@playwright/test'

type FilePayload = {
    name: string
    mimeType: string
    buffer: Buffer
}

type DocumentFixture = {
    file: FilePayload
    hash: string
}

// Test-side contract fixtures. No production parsing or hashing utilities
// are imported into the Node test process.
type ReceiptFixture = {
    version: '1'
    hashAlgorithm: 'SHA256'
    documentHash: string
    timestampAt: string
    timestampTokenBase64: string
}

type VerdictFixture =
    | {
    status: 'VALID'
    reason: 'VERIFIED'
    timestampAt: string
}
    | {
    status: 'INVALID' | 'INDETERMINATE'
    reason: string
    timestampAt: null
}

type JsonReply = {
    kind: 'json'
    status: number
    body: unknown
    waitFor?: Promise<void>
}

type MockReply =
    | JsonReply
    | { kind: 'network-error' }

type VerificationApi = {
    url: string
    requests: Request[]
    enqueue: (reply: MockReply) => void
}

const RECEIPT_LIMIT_BYTES = 128 * 1024
const DOCUMENT_LIMIT_BYTES = 10 * 1024 * 1024

function makeDocument(name: string, contents: string): DocumentFixture {
    const buffer = Buffer.from(contents, 'utf8')

    return {
        file: {
            name,
            mimeType: 'text/plain',
            buffer,
        },
        // Independent expected value; the browser still runs Web Crypto.
        hash: createHash('sha256').update(buffer).digest('hex'),
    }
}

const ORIGINAL_DOCUMENT = makeDocument(
    'project-notes.txt',
    'Proof3161 browser verification fixture.\r\n'
    + 'Private note: café meeting at 09:30.\r\n'
    + 'Document marker: PRIVATE-DOCUMENT-CONTENT-3161.\r\n',
)

const MODIFIED_DOCUMENT = makeDocument(
    'modified-project-notes.txt',
    'Proof3161 browser verification fixture.\r\n'
    + 'Private note: café meeting at 10:30.\r\n'
    + 'Document marker: PRIVATE-DOCUMENT-CONTENT-3161.\r\n',
)

// Deliberately synthetic bytes, NOT a real RFC 3161 timestamp token.
// A mocked VALID response tests frontend behavior only.
const SYNTHETIC_TOKEN = Buffer.from([1, 2, 3, 127, 128, 255])

const RECEIPT: ReceiptFixture = {
    version: '1',
    hashAlgorithm: 'SHA256',
    documentHash: ORIGINAL_DOCUMENT.hash,
    timestampAt: '2026-10-17T10:16:54.123456789Z',
    timestampTokenBase64: SYNTHETIC_TOKEN.toString('base64'),
}

const ALTERED_RECEIPT: ReceiptFixture = {
    ...RECEIPT,
    documentHash:
        (RECEIPT.documentHash[0] === '0' ? '1' : '0')
        + RECEIPT.documentHash.slice(1),
}

const VALID_RESULT: VerdictFixture = {
    status: 'VALID',
    reason: 'VERIFIED',
    timestampAt: RECEIPT.timestampAt,
}

const DOCUMENT_MISMATCH: VerdictFixture = {
    status: 'INVALID',
    reason: 'DOCUMENT_HASH_MISMATCH',
    timestampAt: null,
}

const METADATA_MISMATCH: VerdictFixture = {
    status: 'INVALID',
    reason: 'RECEIPT_METADATA_MISMATCH',
    timestampAt: null,
}

const TRUST_UNCERTAIN: VerdictFixture = {
    status: 'INDETERMINATE',
    reason: 'TRUST_NOT_ESTABLISHED',
    timestampAt: null,
}

function receiptFile(
    value: unknown,
    name = 'receipt.proof.json',
): FilePayload {
    return {
        name,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
    }
}

function malformedReceiptFile(): FilePayload {
    return {
        name: 'malformed.proof.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"version":', 'utf8'),
    }
}

function oversizedReceiptFile(): FilePayload {
    const json = Buffer.from(JSON.stringify(RECEIPT), 'utf8')

    return {
        name: 'oversized.proof.json',
        mimeType: 'application/json',
        // Valid JSON followed by whitespace: size is the intended failure.
        buffer: Buffer.concat([
            json,
            Buffer.alloc(RECEIPT_LIMIT_BYTES + 1 - json.length, 0x20),
        ]),
    }
}

function jsonReply(body: unknown, status = 200): JsonReply {
    return { kind: 'json', status, body }
}

function responseGate() {
    let release!: () => void

    const promise = new Promise<void>((resolve) => {
        release = resolve
    })

    return { promise, release }
}

// Each test receives its own route handlers, reply queue, and request log.
const test = base.extend<{ api: VerificationApi }>({
    api: async ({ context, baseURL }, provideApi) => {
        if (!baseURL) {
            throw new Error('The Playwright baseURL must be configured.')
        }

        const origin = new URL(baseURL).origin
        const verificationUrl = `${origin}/api/v1/verifications`
        const requests: Request[] = []
        const replies: MockReply[] = []
        const unexpectedRequests: string[] = []

        // Install before page.goto(). Never forward API requests.
        await context.route('**/*', async (route) => {
            const request = route.request()
            const url = new URL(request.url())

            if (
                request.url() === verificationUrl
                && request.method() === 'POST'
            ) {
                requests.push(request)

                const reply = replies.shift()

                if (!reply) {
                    unexpectedRequests.push(
                        `Unplanned verification request: ${request.method()} ${request.url()}`,
                    )
                    await route.abort('blockedbyclient')
                    return
                }

                if (reply.kind === 'network-error') {
                    await route.abort('failed')
                    return
                }

                if (reply.waitFor) {
                    await reply.waitFor
                }

                await route.fulfill({
                    status: reply.status,
                    contentType: reply.status >= 400
                        ? 'application/problem+json'
                        : 'application/json',
                    body: JSON.stringify(reply.body),
                })
                return
            }

            const isStaticPath =
                url.pathname === '/'
                || url.pathname === '/index.html'
                || url.pathname === '/favicon.svg'
                || url.pathname === '/icons.svg'
                || url.pathname.startsWith('/assets/')

            const isStaticResource = [
                'document',
                'script',
                'stylesheet',
                'image',
                'font',
                'other',
            ].includes(request.resourceType())

            if (
                url.origin === origin
                && url.search === ''
                && request.method() === 'GET'
                && request.postData() === null
                && isStaticPath
                && isStaticResource
            ) {
                // Only the local preview document and static resources.
                // Arbitrary fetch/XHR requests are not allowed here.
                await route.continue()
                return
            }

            unexpectedRequests.push(
                `${request.method()} ${request.url()}`,
            )
            await route.abort('blockedbyclient')
        })

        // HTTP routing does not intercept WebSocket connections.
        await context.routeWebSocket(/.*/, async (socket) => {
            unexpectedRequests.push(`WebSocket ${socket.url()}`)
            await socket.close()
        })

        try {
            await provideApi({
                url: verificationUrl,
                requests,
                enqueue(reply) {
                    replies.push(reply)
                },
            })
        } finally {
            expect(
                unexpectedRequests,
                'Unexpected application network activity',
            ).toEqual([])
        }
    },
})

function verificationUi(page: Page) {
    const section = page.getByRole('region', {
        name: 'Verify receipt',
        exact: true,
    })

    return {
        section,
        documentInput: section.getByLabel(
            'Original document for verification',
            { exact: true },
        ),
        receiptInput: section.getByLabel(
            'Portable proof receipt (.proof.json)',
            { exact: true },
        ),
        hash: section.getByLabel(
            'Verification document SHA-256',
            { exact: true },
        ),
        button: section.getByRole('button', {
            name: /^(Verify receipt|Retry verification|Verifying receipt…)$/,
        }),
        verdict: section.getByRole('heading', {
            level: 3,
            name: /^(VALID|INVALID|INDETERMINATE):/,
        }),
        verifiedTime: section.locator('.verification-result time'),
        alert: section.getByRole('alert'),
    }
}

type VerificationUi = ReturnType<typeof verificationUi>

async function openVerification(page: Page): Promise<VerificationUi> {
    await page.goto('/')

    await page.getByRole('link', {
        name: 'Verify receipt',
        exact: true,
    }).click()

    const ui = verificationUi(page)

    await expect(ui.section).toBeVisible()
    await expect(ui.button).toBeDisabled()
    await expect(ui.verdict).toHaveCount(0)

    return ui
}

async function selectDocument(
    ui: VerificationUi,
    document: DocumentFixture,
): Promise<void> {
    await ui.documentInput.setInputFiles(document.file)

    // This value comes from browser File.arrayBuffer() + crypto.subtle.digest().
    await expect(ui.hash).toHaveText(document.hash)
    await expect(
        ui.section.getByText('Document hash calculated locally.', {
            exact: true,
        }),
    ).toBeVisible()
}

async function selectReceipt(
    ui: VerificationUi,
    value: unknown,
    name = 'receipt.proof.json',
): Promise<void> {
    await ui.receiptInput.setInputFiles(receiptFile(value, name))

    await expect(
        ui.section.getByText('Receipt structure checked.', {
            exact: true,
        }),
    ).toBeVisible()
}

async function prepareInputs(
    page: Page,
    document = ORIGINAL_DOCUMENT,
    receipt: unknown = RECEIPT,
): Promise<VerificationUi> {
    const ui = await openVerification(page)

    await selectDocument(ui, document)
    await expect(ui.button).toBeDisabled()

    await selectReceipt(ui, receipt)
    await expect(ui.button).toBeEnabled()

    return ui
}

function expectPayload(
    request: Request,
    apiUrl: string,
    expectedHash: string,
    expectedReceipt: ReceiptFixture,
): void {
    expect(request.method()).toBe('POST')
    expect(request.url()).toBe(apiUrl)
    expect(request.headers()['content-type']).toBe('application/json')
    expect(request.headers()['accept']).toBe('application/json')

    // Compare the entire payload with independently prepared expectations.
    // Do not use objectContaining or derive expectations from this request.
    expect(request.postDataJSON()).toStrictEqual({
        documentHash: expectedHash,
        portableProof: {
            version: expectedReceipt.version,
            hashAlgorithm: expectedReceipt.hashAlgorithm,
            documentHash: expectedReceipt.documentHash,
            timestampAt: expectedReceipt.timestampAt,
            timestampTokenBase64: expectedReceipt.timestampTokenBase64,
        },
    })
}

async function submit(
    ui: VerificationUi,
    api: VerificationApi,
    expectedHash: string,
    expectedReceipt: ReceiptFixture,
    expectedCount = 1,
): Promise<void> {
    // File selection and preparation must not submit automatically.
    expect(api.requests).toHaveLength(expectedCount - 1)
    await expect(ui.button).toBeEnabled()

    await ui.button.click()

    await expect.poll(() => api.requests.length).toBe(expectedCount)

    expectPayload(
        api.requests[expectedCount - 1],
        api.url,
        expectedHash,
        expectedReceipt,
    )
}

async function expectVerdict(
    ui: VerificationUi,
    result: VerdictFixture,
): Promise<void> {
    const titles = {
        VALID: 'VALID: Verification succeeded',
        INVALID: 'INVALID: Verification failed',
        INDETERMINATE: 'INDETERMINATE: Verification incomplete',
    }

    await expect(ui.verdict).toHaveText(titles[result.status])
    await expect(ui.alert).toHaveCount(0)

    if (result.status === 'VALID') {
        await expect(
            ui.section.getByText('Verified timestamp (UTC)', {
                exact: true,
            }),
        ).toBeVisible()
        await expect(ui.verifiedTime).toBeVisible()
        await expect(ui.verifiedTime).toHaveText(result.timestampAt)
        await expect(ui.verifiedTime).toHaveAttribute(
            'datetime',
            result.timestampAt,
        )
    } else {
        await expect(ui.verifiedTime).toHaveCount(0)
        await expect(
            ui.section.getByText('Verified timestamp (UTC)', {
                exact: true,
            }),
        ).toHaveCount(0)

        await ui.section.getByText('Technical details', {
            exact: true,
        }).click()

        await expect(
            ui.section.getByText(result.reason, { exact: true }),
        ).toBeVisible()
    }
}

test('verifies explicitly using a local hash and sends only supported receipt fields', async ({
                                                                                                  page,
                                                                                                  api,
                                                                                              }) => {
    api.enqueue(jsonReply(VALID_RESULT))

    // These extra fields must be discarded by the real receipt parser.
    const receiptWithExtraFields = {
        ...RECEIPT,
        id: 'not-a-real-database-proof-id',
        documentName: ORIGINAL_DOCUMENT.file.name,
        fileSize: ORIGINAL_DOCUMENT.file.buffer.length,
        documentBytes: ORIGINAL_DOCUMENT.file.buffer.toString('base64'),
        trusted: true,
    }

    const ui = await prepareInputs(
        page,
        ORIGINAL_DOCUMENT,
        receiptWithExtraFields,
    )

    await expect(ui.hash).toHaveText(ORIGINAL_DOCUMENT.hash)
    expect(ORIGINAL_DOCUMENT.hash).toMatch(/^[0-9a-f]{64}$/)

    await submit(ui, api, ORIGINAL_DOCUMENT.hash, RECEIPT)
    await expectVerdict(ui, VALID_RESULT)

    await expect(
        ui.section.getByText(
            "Verification succeeded under the server's configured trust policy.",
            { exact: true },
        ),
    ).toBeVisible()

    expect(api.requests).toHaveLength(1)
})

test('preserves an independently calculated hash when the selected document differs', async ({
                                                                                                 page,
                                                                                                 api,
                                                                                             }) => {
    api.enqueue(jsonReply(DOCUMENT_MISMATCH))

    expect(MODIFIED_DOCUMENT.hash).not.toBe(RECEIPT.documentHash)

    const ui = await prepareInputs(page, MODIFIED_DOCUMENT)

    await submit(ui, api, MODIFIED_DOCUMENT.hash, RECEIPT)
    await expectVerdict(ui, DOCUMENT_MISMATCH)

    await expect(
        ui.section.getByText(
            'The selected document does not match the fingerprint in the signed timestamp.',
            { exact: true },
        ),
    ).toBeVisible()

    expect(api.requests).toHaveLength(1)
})

test('preserves altered receipt hash metadata for backend verification', async ({
                                                                                    page,
                                                                                    api,
                                                                                }) => {
    api.enqueue(jsonReply(METADATA_MISMATCH))

    expect(ALTERED_RECEIPT.documentHash).not.toBe(ORIGINAL_DOCUMENT.hash)

    const ui = await prepareInputs(
        page,
        ORIGINAL_DOCUMENT,
        ALTERED_RECEIPT,
    )

    await submit(ui, api, ORIGINAL_DOCUMENT.hash, ALTERED_RECEIPT)
    await expectVerdict(ui, METADATA_MISMATCH)

    await expect(
        ui.section.getByText(
            'The receipt hash or timestamp does not match the signed timestamp token.',
            { exact: true },
        ),
    ).toBeVisible()
})

test('explains indeterminate trust without declaring the document invalid', async ({
                                                                                       page,
                                                                                       api,
                                                                                   }) => {
    api.enqueue(jsonReply(TRUST_UNCERTAIN))

    const ui = await prepareInputs(page)

    await submit(ui, api, ORIGINAL_DOCUMENT.hash, RECEIPT)
    await expectVerdict(ui, TRUST_UNCERTAIN)

    await expect(
        ui.section.getByText(
            'The server could not establish certificate trust under its configured policy.',
            { exact: true },
        ),
    ).toBeVisible()

    await expect(
        ui.section.getByText(
            'This does not automatically mean the document or receipt was falsified.',
            { exact: true },
        ),
    ).toBeVisible()

    await expect(
        ui.section.getByRole('heading', {
            name: 'INVALID: Verification failed',
            exact: true,
        }),
    ).toHaveCount(0)
})

const invalidReceiptCases: Array<{
    name: string
    file: () => FilePayload
    message: string
}> = [
    {
        name: 'malformed JSON',
        file: malformedReceiptFile,
        message: 'The receipt file does not contain valid JSON.',
    },
    {
        name: 'unsupported version',
        file: () => receiptFile({
            ...RECEIPT,
            version: '2',
        }, 'unsupported.proof.json'),
        message: 'Only portable proof version "1" is supported.',
    },
    {
        name: 'oversized receipt',
        file: oversizedReceiptFile,
        message: 'The receipt file must not exceed 128 KiB.',
    },
]

for (const scenario of invalidReceiptCases) {
    test(`rejects ${scenario.name} locally without an API request`, async ({
                                                                               page,
                                                                               api,
                                                                           }) => {
        // No reply is queued: any API request is unexpected.
        const ui = await openVerification(page)

        await selectDocument(ui, ORIGINAL_DOCUMENT)
        await ui.receiptInput.setInputFiles(scenario.file())

        await expect(ui.alert).toContainText(scenario.message)
        await expect(ui.receiptInput).toHaveAttribute('aria-invalid', 'true')
        await expect(ui.button).toBeDisabled()
        await expect(ui.verdict).toHaveCount(0)
        await expect(ui.verifiedTime).toHaveCount(0)

        expect(api.requests).toHaveLength(0)
    })
}

const failureCases: Array<{
    name: string
    reply: MockReply
    message: string
}> = [
    {
        name: 'HTTP 400',
        reply: jsonReply({
            status: 400,
            title: 'Invalid verification request',
            detail: 'The verification request was rejected.',
        }, 400),
        message: 'The verification request was rejected.',
    },
    {
        name: 'HTTP 503',
        reply: jsonReply({
            status: 503,
            title: 'Service unavailable',
            detail: 'The verification service is temporarily unavailable.',
        }, 503),
        message: 'The verification service is temporarily unavailable.',
    },
    {
        name: 'network failure',
        reply: { kind: 'network-error' },
        message: 'Unable to reach the verification service. Please try again.',
    },
]

for (const scenario of failureCases) {
    test(`handles ${scenario.name} as an operation failure and retries only on request`, async ({
                                                                                                    page,
                                                                                                    api,
                                                                                                }) => {
        api.enqueue(scenario.reply)
        api.enqueue(jsonReply(VALID_RESULT))

        const ui = await prepareInputs(page)

        await submit(ui, api, ORIGINAL_DOCUMENT.hash, RECEIPT)

        await expect(ui.alert).toContainText('Verification did not complete.')
        await expect(ui.alert).toContainText(scenario.message)
        await expect(ui.alert).toContainText(
            'No verification verdict is available.',
        )

        await expect(ui.verdict).toHaveCount(0)
        await expect(ui.verifiedTime).toHaveCount(0)
        await expect(ui.hash).toHaveText(ORIGINAL_DOCUMENT.hash)
        await expect(
            ui.section.getByText('Receipt: receipt.proof.json', { exact: true }),
        ).toBeVisible()

        await expect(ui.button).toHaveText('Retry verification')
        await expect(ui.documentInput).toBeEnabled()
        await expect(ui.receiptInput).toBeEnabled()
        expect(api.requests).toHaveLength(1)

        // Reuse the prepared inputs; no reselection or automatic retry.
        await submit(ui, api, ORIGINAL_DOCUMENT.hash, RECEIPT, 2)
        await expectVerdict(ui, VALID_RESULT)

        expect(api.requests).toHaveLength(2)
    })
}

test('locks inputs and prevents duplicate submissions while a response is pending', async ({
                                                                                               page,
                                                                                               api,
                                                                                           }) => {
    const gate = responseGate()

    api.enqueue({
        ...jsonReply(VALID_RESULT),
        waitFor: gate.promise,
    })

    const ui = await prepareInputs(page)

    try {
        await submit(ui, api, ORIGINAL_DOCUMENT.hash, RECEIPT)

        await expect(ui.button).toHaveText('Verifying receipt…')
        await expect(ui.button).toBeDisabled()
        await expect(ui.documentInput).toBeDisabled()
        await expect(ui.receiptInput).toBeDisabled()
        await expect(ui.verdict).toHaveCount(0)

        await expect(
            ui.section.getByText(
                'Waiting for the server to verify the signed timestamp and certificate trust…',
                { exact: true },
            ),
        ).toBeVisible()

        // Use real pointer events. Locator.click() would wait for a disabled
        // button to become enabled, which is not the interaction being tested.
        const bounds = await ui.button.boundingBox()

        if (!bounds) {
            throw new Error('The pending verification button is not visible.')
        }

        const x = bounds.x + bounds.width / 2
        const y = bounds.y + bounds.height / 2

        await page.mouse.click(x, y)
        await page.mouse.dblclick(x, y)

        expect(api.requests).toHaveLength(1)
    } finally {
        // Always release the intercepted response, even if an assertion fails.
        gate.release()
    }

    await expectVerdict(ui, VALID_RESULT)
    await expect(ui.documentInput).toBeEnabled()
    await expect(ui.receiptInput).toBeEnabled()

    expect(api.requests).toHaveLength(1)
})

for (const replacement of ['document', 'receipt'] as const) {
    test(`clears a previous verdict when replacing the ${replacement}`, async ({
                                                                                   page,
                                                                                   api,
                                                                               }) => {
        api.enqueue(jsonReply(VALID_RESULT))
        api.enqueue(jsonReply(
            replacement === 'document'
                ? DOCUMENT_MISMATCH
                : METADATA_MISMATCH,
        ))

        const ui = await prepareInputs(page)

        await submit(ui, api, ORIGINAL_DOCUMENT.hash, RECEIPT)
        await expectVerdict(ui, VALID_RESULT)

        // An invalid intermediate selection gives a deterministic state in
        // which the old verdict must be gone and submission must be disabled.
        if (replacement === 'document') {
            await ui.documentInput.setInputFiles({
                name: 'too-large.txt',
                mimeType: 'text/plain',
                buffer: Buffer.alloc(DOCUMENT_LIMIT_BYTES + 1, 0x78),
            })
            await expect(ui.alert).toContainText(
                'The file must not exceed 10 MiB.',
            )
        } else {
            await ui.receiptInput.setInputFiles(malformedReceiptFile())
            await expect(ui.alert).toContainText(
                'The receipt file does not contain valid JSON.',
            )
        }

        await expect(ui.verdict).toHaveCount(0)
        await expect(ui.verifiedTime).toHaveCount(0)
        await expect(ui.button).toBeDisabled()
        expect(api.requests).toHaveLength(1)

        if (replacement === 'document') {
            await selectDocument(ui, MODIFIED_DOCUMENT)
        } else {
            await selectReceipt(
                ui,
                ALTERED_RECEIPT,
                'replacement.proof.json',
            )
        }

        await expect(ui.alert).toHaveCount(0)
        await expect(ui.button).toBeEnabled()
        await expect(ui.verdict).toHaveCount(0)
        expect(api.requests).toHaveLength(1)

        if (replacement === 'document') {
            await submit(ui, api, MODIFIED_DOCUMENT.hash, RECEIPT, 2)
            await expectVerdict(ui, DOCUMENT_MISMATCH)
        } else {
            await submit(ui, api, ORIGINAL_DOCUMENT.hash, ALTERED_RECEIPT, 2)
            await expectVerdict(ui, METADATA_MISMATCH)
        }

        expect(api.requests).toHaveLength(2)
    })
}