import { useRef, useState } from 'react'

import { FileSelector } from './components/FileSelector'
import { MAX_FILE_SIZE_BYTES, sha256 } from './lib/sha256'
import './App.css'

type HashState =
    | { status: 'idle' }
    | { status: 'hashing'; fileName: string }
    | { status: 'success'; fileName: string; hash: string }
    | { status: 'error'; message: string }

function App() {
    const [state, setState] = useState<HashState>({
        status: 'idle',
    })

    const requestIdRef = useRef(0)

    async function handleFileSelect(file: File): Promise<void> {
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

                        <a
                            className="sidebar-link active"
                            href="#hash-document"
                            aria-current="page"
                        >
                            Hash document
                        </a>

                        <span className="sidebar-link unavailable">
              Create proof
              <small>Planned</small>
            </span>

                        <span className="sidebar-link unavailable">
              Verify receipt
              <small>Planned</small>
            </span>
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
                            disabled={state.status === 'hashing'}
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
                            A fingerprint alone does not prove when a document
                            existed. The next step will use an RFC 3161 timestamp
                            authority to create a signed proof.
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
