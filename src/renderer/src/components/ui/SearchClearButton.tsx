import { X } from 'lucide-react'

interface Props {
    onClick: () => void
}

export function SearchClearButton({ onClick }: Props) {
    return (
        <button
            onClick={onClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors"
        >
            <X className="w-3.5 h-3.5" />
        </button>
    )
}
