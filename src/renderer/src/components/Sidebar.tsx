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
        <aside className="w-48 shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800">
            <div className="px-4 py-5 border-b border-zinc-800">
                <span className="text-sm font-bold tracking-widest uppercase text-red-500">
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
                                ? 'bg-zinc-700 text-zinc-100'
                                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
        </aside>
    )
}
