interface Props {
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
    title?: string
}

export function Toggle({ checked, onChange, disabled, title }: Props) {
    return (
        <button
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            title={title}
            onClick={() => onChange(!checked)}
            className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
                checked ? 'bg-accent' : 'bg-surface-active'
            }`}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    checked ? 'translate-x-4' : 'translate-x-0'
                }`}
            />
        </button>
    )
}
