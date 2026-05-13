import { useState, useRef, useEffect } from 'react'

interface Option {
    value: string
    label: string
}

interface Props {
    value: string
    onChange: (value: string) => void
    options: Option[]
    placeholder?: string
}

export function Select({ value, onChange, options, placeholder }: Props) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const selected = options.find((o) => o.value === value)

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="text-sm px-3 py-1.5 rounded bg-surface-hover border border-border text-text flex items-center gap-2 hover:bg-surface-active transition-colors whitespace-nowrap"
            >
                <span className={selected ? 'text-text' : 'text-text-subtle'}>
                    {selected ? selected.label : placeholder}
                </span>
                <svg
                    className={`w-3 h-3 text-text-subtle shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M2 4l4 4 4-4" />
                </svg>
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-1 z-50 min-w-full bg-surface-raised border border-border rounded shadow-lg overflow-y-auto max-h-60">
                    {options.map((o) => (
                        <button
                            key={o.value}
                            onClick={() => {
                                onChange(o.value)
                                setOpen(false)
                            }}
                            className={`w-full text-left text-sm px-3 py-2 transition-colors ${
                                o.value === value
                                    ? 'bg-accent text-white'
                                    : 'text-text hover:bg-surface-hover'
                            }`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
