interface Props {
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
    title?: string
    indeterminate?: boolean
}

export function Toggle({ checked, onChange, disabled, title, indeterminate }: Props) {
    return (
        <button
            role="switch"
            aria-checked={indeterminate ? 'mixed' : checked}
            disabled={disabled}
            title={title}
            onClick={() => onChange(!checked)}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
                indeterminate ? 'bg-accent/50' : checked ? 'bg-accent' : 'bg-surface-active'
            }`}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    indeterminate ? 'translate-x-2' : checked ? 'translate-x-4' : 'translate-x-0'
                }`}
            />
        </button>
    )
}
