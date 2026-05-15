import { useState } from 'react'
import { Compass, Package, Settings, ChevronLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type NavView = 'browse' | 'installed' | 'settings'

interface Props {
    view: NavView
    onViewChange: (v: NavView) => void
}

const navItems: { id: NavView; label: string; icon: LucideIcon }[] = [
    { id: 'browse', label: 'Browse Mods', icon: Compass },
    { id: 'installed', label: 'Installed', icon: Package },
    { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ view, onViewChange }: Props) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <aside
            className={`${collapsed ? 'w-12' : 'w-48'} shrink-0 flex flex-col bg-surface-raised border-r border-border transition-[width] duration-200 overflow-hidden`}
        >
            <nav className="flex flex-col gap-1 p-2 flex-1">
                {navItems.map((item) => {
                    const Icon = item.icon
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            title={collapsed ? item.label : undefined}
                            className={`w-full px-2 py-2 gap-2.5 flex items-center rounded text-sm transition-colors ${
                                view === item.id
                                    ? 'bg-surface-active text-text'
                                    : 'text-text-muted hover:bg-surface-hover hover:text-text'
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span
                                className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`}
                            >
                                {item.label}
                            </span>
                        </button>
                    )
                })}
            </nav>

            <div className="p-2 border-t border-border">
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="w-full px-2 py-1.5 gap-2.5 flex items-center rounded text-xs text-text-subtle hover:bg-surface-hover hover:text-text transition-colors"
                >
                    <ChevronLeft
                        className={`w-4 h-4 shrink-0 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
                    />
                    <span
                        className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`}
                    >
                        Collapse menu
                    </span>
                </button>
            </div>
        </aside>
    )
}
