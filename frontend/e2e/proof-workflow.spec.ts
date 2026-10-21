import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Request } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:4173'

const DOCUMENT_HASH =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

const PROOF_ID = 'adfe140a-0bce-45b6-8bd7-ed652714c314'
const RECEIPT_PATH = `/api/v1/proofs/${PROOF_ID}/receipt`
const RECEIPT_FILENAME = `proof3161-${PROOF_ID}.proof.json`

// Synthetic token bytes for browser tests only.
const TOKEN_BYTES = Buffer.from([1, 2, 3, 127, 128, 255])

const RECEIPT = {
    version: '1',
    hashAlgorithm: 'SHA256',
    documentHash: DOCUMENT_HASH,
    timestampAt: '2026-10-17T10:16:54Z',
    timestampTokenBase64: TOKEN_BYTES.toString('base64'),
}

const PROOF = {
    id: PROOF_ID,
    hashAlgorithm: RECEIPT.hashAlgorithm,
    documentHash: RECEIPT.documentHash,
    timestampAt: RECEIPT.timestampAt,
    timestampTokenBase64: RECEIPT.timestampTokenBase64,
    createdAt: '2026-10-17T10:16:55.123456Z',
}

const TSA_FAILURE = {
    status: 502,
    title: 'Timestamping failed',
    detail:
        'Could not obtain a valid timestamp from the timestamp authority.',
}

async function mockApi(
    context: BrowserContext,
    creationFails = false,
) {
    const apiRequests: Request[] = []
    const unexpectedRequests: string[] = []

    await context.route('**/*', async route => {
        const request = route.request()
        const url = new URL(request.url())

        if (url.origin !== ORIGIN) {
            unexpectedRequests.push(
                `${request.method()} ${request.url()}`,
            )
            await route.abort()
            return
        }

        const isApiRequest =
            url.pathname === '/api'
            || url.pathname.startsWith('/api/')

        if (isApiRequest) {
            apiRequests.push(request)

            if (
                url.pathname === '/api/v1/proofs'
                && url.search === ''
                && request.method() === 'POST'
            ) {
                await route.fulfill({
                    status: creationFails ? 502 : 201,
                    contentType: creationFails
                        ? 'application/problem+json'
                        : 'application/json',
                    body: JSON.stringify(
                        creationFails ? TSA_FAILURE : PROOF,
                    ),
                })
                return
            }

            if (
                url.pathname === RECEIPT_PATH
                && url.search === ''
                && request.method() === 'GET'
            ) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    headers: {
                        'Content-Disposition':
                            `attachment; filename="${RECEIPT_FILENAME}"`,
                    },
                    body: JSON.stringify(RECEIPT),
                })
                return
            }
        } else if (request.method() === 'GET') {
            // Allow the local HTML, JavaScript, CSS, and other assets.
            await route.continue()
            return
        }

        unexpectedRequests.push(
            `${request.method()} ${request.url()}`,
        )
        await route.abort()
    })

    return { apiRequests, unexpectedRequests }
}

test('hashes a document, creates a proof, and downloads its receipt', async ({
                                                                                 page,
                                                                                 context,
                                                                             }, testInfo) => {
    const { apiRequests, unexpectedRequests } = await mockApi(context)

    await page.goto('/')

    const fileInput = page
        .getByRole('region', { name: 'Select a file', exact: true })
        .locator('input[type="file"]')
    const createButton = page.getByRole('button', {
        name: 'Create proof',
        exact: true,
    })

    await expect(createButton).toBeDisabled()

    await fileInput.setInputFiles({
        name: 'document.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('abc', 'utf8'),
    })

    await expect(
        page.getByLabel('Calculated SHA-256 hash', { exact: true }),
    ).toHaveText(DOCUMENT_HASH)

    await expect(page.getByText('document.txt', {
        exact: false,
    })).toBeVisible()

    await expect(createButton).toBeEnabled()

    // Selecting and hashing a document must not call the API.
    expect(apiRequests).toHaveLength(0)

    await createButton.click()

    await expect(page.getByText(PROOF_ID, {
        exact: true,
    })).toBeVisible()

    await expect(page.getByText(PROOF.timestampAt, {
        exact: true,
    })).toBeVisible()

    expect(apiRequests).toHaveLength(1)

    const creationRequest = apiRequests[0]

    expect(creationRequest.method()).toBe('POST')
    expect(creationRequest.url()).toBe(`${ORIGIN}/api/v1/proofs`)
    expect(creationRequest.headers()['content-type']).toBe(
        'application/json',
    )

    // Exact equality excludes file contents, filename, and extra fields.
    expect(creationRequest.postDataJSON()).toEqual({
        documentHash: DOCUMENT_HASH,
    })

    const downloadPromise = page.waitForEvent('download')

    await page.getByRole('link', {
        name: 'Download .proof.json',
        exact: true,
    }).click()

    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe(RECEIPT_FILENAME)

    const savedPath = testInfo.outputPath(RECEIPT_FILENAME)
    await download.saveAs(savedPath)

    expect(await download.failure()).toBeNull()

    const downloadedReceipt = JSON.parse(
        await readFile(savedPath, 'utf8'),
    )

    expect(downloadedReceipt).toEqual(RECEIPT)

    expect(
        Buffer.from(downloadedReceipt.timestampTokenBase64, 'base64'),
    ).toEqual(TOKEN_BYTES)

    expect(apiRequests).toHaveLength(2)
    expect(apiRequests[1].method()).toBe('GET')
    expect(apiRequests[1].url()).toBe(`${ORIGIN}${RECEIPT_PATH}`)
    expect(apiRequests[1].postData()).toBeNull()

    expect(unexpectedRequests).toEqual([])
})

test('shows a timestamping error and preserves the calculated hash', async ({
                                                                                page,
                                                                                context,
                                                                            }) => {
    const { apiRequests, unexpectedRequests } = await mockApi(
        context,
        true,
    )

    await page.goto('/')

    await page
        .getByRole('region', { name: 'Select a file', exact: true })
        .locator('input[type="file"]')
        .setInputFiles({
        name: 'document.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('abc', 'utf8'),
    })

    const hashOutput = page.getByLabel(
        'Calculated SHA-256 hash',
        { exact: true },
    )

    await expect(hashOutput).toHaveText(DOCUMENT_HASH)

    const createButton = page.getByRole('button', {
        name: 'Create proof',
        exact: true,
    })

    await createButton.click()

    await expect(page.getByRole('alert')).toHaveText(
        TSA_FAILURE.detail,
    )

    await expect(hashOutput).toHaveText(DOCUMENT_HASH)
    await expect(createButton).toBeEnabled()

    await expect(page.getByRole('link', {
        name: 'Download .proof.json',
        exact: true,
    })).toHaveCount(0)

    expect(apiRequests).toHaveLength(1)
    expect(unexpectedRequests).toEqual([])
})