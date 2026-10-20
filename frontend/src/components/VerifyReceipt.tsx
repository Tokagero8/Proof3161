import { useEffect, useId, useRef, useState } from 'react'

import { verifyProof } from '../api/verifications'
import type { VerificationResponse } from '../api/verifications'
import {
    MAX_RECEIPT_FILE_BYTES,
    readPortableProof,
} from '../lib/portableProof'
import type { PortableProof } from '../lib/portableProof'
import { MAX_FILE_SIZE_BYTES, sha256 } from '../lib/sha256'
import { FileSelector } from './FileSelector'
import { VerificationResult } from './VerificationResult'

type InputState<T> =
    | { status: 'idle' }
    | { status: 'processing'; fileName: string }
    | { status: 'ready'; fileName: string; value: T }
    | { status: 'error'; fileName: string; message: string }

type VerificationState =
    | { status: 'idle' }
    | { status: 'pending' }
    | { status: 'complete'; result: VerificationResponse }
    | { status: 'error'; message: string }

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim()
        ? error.message
        : fallback
}

export function VerifyReceipt() {
    const id = useId()

    const [documentState, setDocumentState] = useState<InputState<string>>({
        status: 'idle',
    })
    const [receiptState, setReceiptState] = useState<InputState<PortableProof>>({
        status: 'idle',
    })
    const [verificationState, setVerificationState] = useState<VerificationState>({
        status: 'idle',
    })

    const documentReadIdRef = useRef(0)
    const receiptReadIdRef = useRef(0)
    const requestControllerRef = useRef<AbortController | null>(null)

    useEffect(() => {
        return () => {
            // Invalidate local work that cannot itself be cancelled.
            documentReadIdRef.current += 1
            receiptReadIdRef.current += 1

            const controller = requestControllerRef.current
            requestControllerRef.current = null
            controller?.abort()
        }
    }, [])

    async function handleDocumentSelect(file: File): Promise<void> {
        if (requestControllerRef.current) {
            return
        }

        const readId = ++documentReadIdRef.current

        setVerificationState({ status: 'idle' })
        setDocumentState({
            status: 'processing',
            fileName: file.name,
        })

        try {
            const hash = await sha256(file)

            if (readId !== documentReadIdRef.current) {
                return
            }

            setDocumentState({
                status: 'ready',
                fileName: file.name,
                value: hash,
            })
        } catch (error) {
            if (readId !== documentReadIdRef.current) {
                return
            }

            setDocumentState({
                status: 'error',
                fileName: file.name,
                message: errorMessage(
                    error,
                    'Unable to read or hash this document. Please select it again.',
                ),
            })
        }
    }

    async function handleReceiptSelect(file: File): Promise<void> {
        if (requestControllerRef.current) {
            return
        }

        const readId = ++receiptReadIdRef.current

        setVerificationState({ status: 'idle' })
        setReceiptState({
            status: 'processing',
            fileName: file.name,
        })

        try {
            const receipt = await readPortableProof(file)

            if (readId !== receiptReadIdRef.current) {
                return
            }

            setReceiptState({
                status: 'ready',
                fileName: file.name,
                value: receipt,
            })
        } catch (error) {
            if (readId !== receiptReadIdRef.current) {
                return
            }

            setReceiptState({
                status: 'error',
                fileName: file.name,
                message: errorMessage(
                    error,
                    'Unable to read this receipt. Please select a valid .proof.json file.',
                ),
            })
        }
    }

    async function handleVerify(): Promise<void> {
        if (
            documentState.status !== 'ready'
            || receiptState.status !== 'ready'
            || requestControllerRef.current
        ) {
            return
        }

        const controller = new AbortController()
        requestControllerRef.current = controller
        setVerificationState({ status: 'pending' })

        try {
            // Keep the independently calculated hash separate from receipt metadata.
            const result = await verifyProof(
                documentState.value,
                receiptState.value,
                controller.signal,
            )

            if (requestControllerRef.current !== controller) {
                return
            }

            setVerificationState({
                status: 'complete',
                result,
            })
        } catch (error) {
            if (requestControllerRef.current !== controller) {
                return
            }

            setVerificationState({
                status: 'error',
                message: errorMessage(
                    error,
                    'Unable to complete the verification request. Please try again.',
                ),
            })
        } finally {
            if (requestControllerRef.current === controller) {
                requestControllerRef.current = null
            }
        }
    }

    const pending = verificationState.status === 'pending'
    const inputsReady = documentState.status === 'ready'
        && receiptState.status === 'ready'

    return (
        <section
            id="verify-receipt"
            className="verification-section"
            aria-labelledby={`${id}-heading`}
            tabIndex={-1}
        >
            <h2 id={`${id}-heading`}>Verify receipt</h2>

            <p className="introduction">
                Select an original document and its saved receipt.
                The document is hashed locally; only its SHA-256 hash and
                the receipt are sent to the verification service.
            </p>

            <div className="verification-inputs">
                <div className="verification-input">
                    <h3>Original document</h3>

                    <FileSelector
                        label="Original document for verification"
                        onFileSelect={handleDocumentSelect}
                        disabled={pending}
                        invalid={documentState.status === 'error'}
                        describedBy={
                            documentState.status === 'error'
                                ? `${id}-document-help ${id}-document-error`
                                : `${id}-document-help`
                        }
                    />

                    <p id={`${id}-document-help`} className="helper-text">
                        Maximum file size: {MAX_FILE_SIZE_BYTES / (1024 * 1024)} MiB.
                        The original document never leaves your browser.
                    </p>

                    {documentState.status !== 'idle' && (
                        <p className="selected-file">
                            <strong>Document:</strong> {documentState.fileName}
                        </p>
                    )}

                    <p className="verification-input-status" role="status">
                        {documentState.status === 'idle' && 'No document selected.'}
                        {documentState.status === 'processing'
                            && `Calculating SHA-256 for ${documentState.fileName}…`}
                        {documentState.status === 'ready'
                            && 'Document hash calculated locally.'}
                    </p>

                    {documentState.status === 'ready' && (
                        <output
                            className="hash-value"
                            aria-label="Verification document SHA-256"
                        >
                            {documentState.value}
                        </output>
                    )}

                    {documentState.status === 'error' && (
                        <p
                            id={`${id}-document-error`}
                            className="error-message"
                            role="alert"
                        >
                            <strong>Could not use this document.</strong>{' '}
                            {documentState.message}
                        </p>
                    )}
                </div>

                <div className="verification-input">
                    <h3>Portable receipt</h3>

                    <FileSelector
                        label="Portable proof receipt (.proof.json)"
                        accept=".json,application/json"
                        onFileSelect={handleReceiptSelect}
                        disabled={pending}
                        invalid={receiptState.status === 'error'}
                        describedBy={
                            receiptState.status === 'error'
                                ? `${id}-receipt-help ${id}-receipt-error`
                                : `${id}-receipt-help`
                        }
                    />

                    <p id={`${id}-receipt-help`} className="helper-text">
                        Select a .proof.json receipt, up to{' '}
                        {MAX_RECEIPT_FILE_BYTES / 1024} KiB.
                        Local format checks do not verify its signature or certificate trust.
                    </p>

                    {receiptState.status !== 'idle' && (
                        <p className="selected-file">
                            <strong>Receipt:</strong> {receiptState.fileName}
                        </p>
                    )}

                    <p className="verification-input-status" role="status">
                        {receiptState.status === 'idle' && 'No receipt selected.'}
                        {receiptState.status === 'processing'
                            && `Reading receipt ${receiptState.fileName}…`}
                        {receiptState.status === 'ready' && 'Receipt structure checked.'}
                    </p>

                    {receiptState.status === 'ready' && (
                        <dl className="receipt-metadata">
                            <dt>Receipt format version</dt>
                            <dd>{receiptState.value.version}</dd>

                            <dt>Hash algorithm</dt>
                            <dd>{receiptState.value.hashAlgorithm}</dd>

                            <dt>Receipt document hash — unverified metadata</dt>
                            <dd>
                                <span className="hash-value">
                                    {receiptState.value.documentHash}
                                </span>
                            </dd>

                            <dt>Receipt timestamp — unverified metadata</dt>
                            <dd>{receiptState.value.timestampAt}</dd>
                        </dl>
                    )}

                    {receiptState.status === 'error' && (
                        <p
                            id={`${id}-receipt-error`}
                            className="error-message"
                            role="alert"
                        >
                            <strong>Could not use this receipt.</strong>{' '}
                            {receiptState.message}
                        </p>
                    )}
                </div>
            </div>

            <button
                type="button"
                className="primary-button"
                onClick={handleVerify}
                disabled={!inputsReady || pending}
            >
                {pending
                    ? 'Verifying receipt…'
                    : verificationState.status === 'error'
                        ? 'Retry verification'
                        : 'Verify receipt'}
            </button>

            <div
                className="verification-announcement"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {verificationState.status === 'idle' && inputsReady && (
                    <p className="processing-message">
                        Inputs ready. Select Verify receipt to start.
                    </p>
                )}

                {pending && (
                    <p className="processing-message">
                        Waiting for the server to verify the signed timestamp and certificate trust…
                    </p>
                )}

                {verificationState.status === 'complete' && (
                    <VerificationResult result={verificationState.result} />
                )}
            </div>

            {verificationState.status === 'error' && (
                <div className="error-message" role="alert">
                    <strong>Verification did not complete.</strong>
                    <p>{verificationState.message}</p>
                    <p>
                        No verification verdict is available.
                        Your selected inputs are still available for review or retry.
                    </p>
                </div>
            )}
        </section>
    )
}