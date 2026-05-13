import type { View } from '../App'

interface Props {
    view: View
    onViewChange: (v: View) => void
}

const navItems: { id: View; label: string }[] = [
    { id: 'browse', label: 'Browse Mods' },
    { id: 'installed', label: 'Installed' },
]

export function Sidebar({ view, onViewChange }: Props) {
    return (
        <aside className="w-48 shrink-0 flex flex-col bg-surface-raised border-r border-border">
            <div className="px-4 py-5 border-b border-border">
                <span className="text-sm font-bold tracking-widest uppercase text-accent-bright">
                    PD3 Mods
                </span>
            </div>
            <nav className="flex flex-col gap-1 p-2 flex-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onViewChange(item.id)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                            view === item.id
                                ? 'bg-surface-active text-text'
                                : 'text-text-muted hover:bg-surface-hover hover:text-text'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
        </aside>
    )
}
