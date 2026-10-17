type FileSelectorProps = {
    onFileSelect: (file: File) => void
    disabled?: boolean
}

export function FileSelector({
                                 onFileSelect,
                                 disabled = false,
                             }: FileSelectorProps) {
    return (
        <label className="file-selector">
            <span>Select a file</span>

            <input
                type="file"
                disabled={disabled}
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0]

                    if (!file) {
                        return
                    }

                    // Allow selecting the same file again, including after an error.
                    event.currentTarget.value = ''

                    onFileSelect(file)
                }}
            />
        </label>
    )
}