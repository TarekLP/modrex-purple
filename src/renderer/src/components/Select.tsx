import { useState, useRef, useEffect, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface Option {
    value: string
    label: string
    icon?: ReactNode
}

interface Props {
    value: string
    onChange: (value: string) => void
    options: Option[]
    placeholder?: string
    disabled?: boolean
}

export function Select({ value, onChange, options, placeholder, disabled }: Props) {
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
                disabled={disabled}
                className="text-sm px-3 py-1.5 rounded bg-surface-hover border border-border text-text flex items-center gap-2 hover:bg-surface-active disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
                <span
                    className={`flex items-center gap-1.5 ${selected ? 'text-text' : 'text-text-subtle'}`}
                >
                    {selected?.icon}
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown
                    className={`w-3 h-3 text-text-subtle shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-1 z-50 min-w-max bg-surface-raised border border-border rounded shadow-lg overflow-y-auto max-h-60">
                    {options.map((o) => (
                        <button
                            key={o.value}
                            onClick={() => {
                                onChange(o.value)
                                setOpen(false)
                            }}
                            className={`w-full text-left text-sm px-3 py-2 transition-colors flex items-center gap-1.5 ${
                                o.value === value
                                    ? 'bg-accent text-white'
                                    : 'text-text hover:bg-surface-hover'
                            }`}
                        >
                            {o.icon}
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
