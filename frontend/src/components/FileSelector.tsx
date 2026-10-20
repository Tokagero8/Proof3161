type FileSelectorProps = {
    onFileSelect: (file: File) => void
    disabled?: boolean
    label?: string
    accept?: string
    describedBy?: string
    invalid?: boolean
}

export function FileSelector({
                                 onFileSelect,
                                 disabled = false,
                                 label = 'Select a file',
                                 accept,
                                 describedBy,
                                 invalid = false,
                             }: FileSelectorProps) {
    return (
        <label className="file-selector">
            <span>{label}</span>

            <input
                type="file"
                accept={accept}
                disabled={disabled}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                    if (disabled) {
                        return
                    }

                    const file = event.currentTarget.files?.[0]

                    if (!file) {
                        return
                    }

                    // Permit selecting the same file again after an error.
                    event.currentTarget.value = ''
                    onFileSelect(file)
                }}
            />
        </label>
    )
}