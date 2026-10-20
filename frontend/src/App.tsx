import { useRef, useState } from 'react'

import { FileSelector } from './components/FileSelector'
import { VerifyReceipt } from './components/VerifyReceipt'
import { MAX_FILE_SIZE_BYTES, sha256 } from './lib/sha256'
import { createProof } from './api/proofs'
import type { ProofResponse } from './api/proofs'
import './App.css'


type HashState =
    | { status: 'idle' }
    | { status: 'hashing'; fileName: string }
    | { status: 'success'; fileName: string; hash: string }
    | { status: 'error'; message: string }

type ProofState =
    | { status: 'idle' }
    | { status: 'creating' }
    | { status: 'success'; proof: ProofResponse }
    | { status: 'error'; message: string }

function App() {
    const [state, setState] = useState<HashState>({
        status: 'idle',
    })

    const requestIdRef = useRef(0)

    const [proofState, setProofState] = useState<ProofState>({
        status: 'idle',
    })

    const proofPendingRef = useRef(false)

    async function handleFileSelect(file: File): Promise<void> {
        if (proofPendingRef.current) {
            return
        }

        setProofState({ status: 'idle' })

        const requestId = ++requestIdRef.current

        setState({
            status: 'hashing',
            fileName: file.name,
        })

        try {
            const hash = await sha256(file)

            if (requestId !== requestIdRef.current) {
                return
            }

            setState({
                status: 'success',
                fileName: file.name,
                hash,
            })
        } catch (error) {
            if (requestId !== requestIdRef.current) {
                return
            }

            setState({
                status: 'error',
                message:
                    error instanceof Error && error.message
                        ? error.message
                        : 'Unable to read or hash this file. Please try again.',
            })
        }
    }

    async function handleCreateProof(): Promise<void> {
        if (
            state.status !== 'success'
            || proofPendingRef.current
            || proofState.status === 'success'
        ) {
            return
        }

        proofPendingRef.current = true
        setProofState({ status: 'creating' })

        try {
            const proof = await createProof(state.hash)

            setProofState({
                status: 'success',
                proof,
            })
        } catch (error) {
            setProofState({
                status: 'error',
                message: error instanceof Error && error.message
                    ? error.message
                    : 'Unable to create the proof.',
            })
        } finally {
            proofPendingRef.current = false
        }
    }

    return (
        <div className="app-shell">
            <header className="site-header">
                <div className="site-brand">
          <span className="brand-symbol" aria-hidden="true">
            P/
          </span>

                    <span className="brand-name">Proof3161</span>
                </div>

                <span className="site-subtitle">
          Proof of Existence · RFC 3161
        </span>
            </header>

            <div className="workspace">
                <aside className="sidebar">
                    <nav aria-label="Application workflow">
                        <p className="sidebar-heading">WORKFLOW</p>
                        <a className="sidebar-link" href="#hash-document">
                            Hash document
                        </a>

                        <a className="sidebar-link" href="#create-proof">
                            Create proof
                        </a>

                        <a className="sidebar-link" href="#verify-receipt">
                            Verify receipt
                        </a>
                    </nav>

                    <div className="sidebar-note">
                        <strong>Privacy by design</strong>
                        <p>
                            Documents are processed locally.
                            The original file is never uploaded.
                        </p>
                    </div>
                </aside>

                <main className="main-content" id="hash-document">
                    <div className="content-header">
                        <p className="section-label">
                            DOCUMENT PROCESSING
                        </p>

                        <h1>Hash a document</h1>

                        <p className="introduction">
                            Select a file to calculate its SHA-256 fingerprint.
                            The calculation runs entirely in your browser.
                        </p>
                    </div>

                    <section
                        className="hash-section"
                        aria-labelledby="file-section-heading"
                    >
                        <h2 id="file-section-heading">
                            Select a file
                        </h2>

                        <FileSelector
                            onFileSelect={handleFileSelect}
                            disabled={
                                state.status === 'hashing'
                                || proofState.status === 'creating'
                            }
                        />

                        <p className="helper-text">
                            Maximum file size:{' '}
                            {MAX_FILE_SIZE_BYTES / (1024 * 1024)} MiB.
                            No document data is sent to the server.
                        </p>
                    </section>

                    <section
                        className="result-section"
                        aria-labelledby="result-heading"
                    >
                        <h2 id="result-heading">
                            SHA-256 fingerprint
                        </h2>

                        <div
                            className="result-content"
                            role="status"
                            aria-live="polite"
                            aria-atomic="true"
                        >
                            {state.status === 'idle' && (
                                <p className="empty-message">
                                    No document selected yet.
                                </p>
                            )}

                            {state.status === 'hashing' && (
                                <p className="processing-message">
                                    Calculating SHA-256 for{' '}
                                    <strong>{state.fileName}</strong>…
                                </p>
                            )}

                            {state.status === 'success' && (
                                <div className="hash-result">
                                    <p className="selected-file">
                                        <strong>Document:</strong>{' '}
                                        {state.fileName}
                                    </p>

                                    <output
                                        className="hash-value"
                                        aria-label="Calculated SHA-256 hash"
                                    >
                                        {state.hash}
                                    </output>

                                    <p className="success-message">
                                        SHA-256 calculated locally.
                                    </p>
                                </div>
                            )}
                        </div>

                        {state.status === 'error' && (
                            <p className="error-message" role="alert">
                                {state.message}
                            </p>
                        )}
                    </section>

                    <section
                        id="create-proof"
                        className="proof-section"
                        aria-labelledby="proof-heading"
                    >
                        <h2 id="proof-heading">Create a proof</h2>

                        <p className="helper-text">
                            Submit the fingerprint to obtain an RFC 3161 timestamp.
                        </p>

                        <button
                            type="button"
                            className="primary-button"
                            onClick={handleCreateProof}
                            disabled={
                                state.status !== 'success'
                                || proofState.status === 'creating'
                                || proofState.status === 'success'
                            }
                        >
                            {proofState.status === 'creating'
                                ? 'Creating proof…'
                                : 'Create proof'}
                        </button>

                        <div role="status" aria-live="polite">
                            {proofState.status === 'creating' && (
                                <p className="processing-message">
                                    Waiting for the timestamp authority…
                                </p>
                            )}

                            {proofState.status === 'success' && (
                                <div className="proof-details">
                                    <p className="success-message">Proof created.</p>

                                    <dl>
                                        <dt>Proof ID</dt>
                                        <dd>{proofState.proof.id}</dd>

                                        <dt>Timestamp</dt>
                                        <dd>
                                            <time dateTime={proofState.proof.timestampAt}>
                                                {proofState.proof.timestampAt}
                                            </time>
                                        </dd>
                                    </dl>

                                    <p>
                                        <a
                                            className="receipt-download"
                                            href={`/api/v1/proofs/${encodeURIComponent(proofState.proof.id)}/receipt`}
                                        >
                                            Download .proof.json
                                        </a>
                                    </p>

                                    <p className="helper-text">
                                        Keep this receipt together with your original document.
                                        It contains the document fingerprint and signed timestamp.
                                    </p>
                                </div>
                            )}
                        </div>

                        {proofState.status === 'error' && (
                            <p className="error-message" role="alert">
                                {proofState.message}
                            </p>
                        )}
                    </section>

                    <VerifyReceipt />

                    <section
                        className="information-section"
                        aria-labelledby="information-heading"
                    >
                        <h2 id="information-heading">
                            About this fingerprint
                        </h2>

                        <p>
                            SHA-256 produces a 256-bit fingerprint of the
                            document's exact bytes. Changing the document
                            changes its fingerprint with overwhelming probability.
                        </p>

                        <p>
                            A fingerprint alone does not prove when a document existed.
                            Creating a proof obtains a signed RFC 3161 timestamp
                            for that fingerprint.
                        </p>
                    </section>
                </main>
            </div>

            <footer className="site-footer">
                <span>Proof3161</span>
                <span>Client-side SHA-256 · RFC 3161</span>
            </footer>
        </div>
    )
}

export default App
