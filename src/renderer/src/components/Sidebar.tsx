import { useState } from 'react'
import type { View } from '../App'

interface Props {
    view: View
    onViewChange: (v: View) => void
}

const navItems: { id: View; label: string; short: string }[] = [
    { id: 'browse', label: 'Browse Mods', short: 'B' },
    { id: 'installed', label: 'Installed', short: 'I' },
]

export function Sidebar({ view, onViewChange }: Props) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <aside
            className={`${collapsed ? 'w-12' : 'w-48'} shrink-0 flex flex-col bg-surface-raised border-r border-border transition-[width] duration-200`}
        >
            <nav className={`flex flex-col gap-1 p-2 flex-1 ${collapsed ? 'items-center' : ''}`}>
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onViewChange(item.id)}
                        title={collapsed ? item.label : undefined}
                        className={`transition-colors rounded text-sm ${
                            collapsed
                                ? `w-8 h-8 flex items-center justify-center font-medium ${
                                      view === item.id
                                          ? 'bg-surface-active text-text'
                                          : 'text-text-muted hover:bg-surface-hover hover:text-text'
                                  }`
                                : `w-full text-left px-3 py-2 ${
                                      view === item.id
                                          ? 'bg-surface-active text-text'
                                          : 'text-text-muted hover:bg-surface-hover hover:text-text'
                                  }`
                        }`}
                    >
                        {collapsed ? item.short : item.label}
                    </button>
                ))}
            </nav>

            <div className="p-2 border-t border-border">
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={`w-full flex items-center py-1.5 rounded text-xs text-text-subtle hover:bg-surface-hover hover:text-text transition-colors ${collapsed ? 'justify-center' : 'justify-between px-2'}`}
                >
                    {!collapsed && <span>Collapse</span>}
                    <span className="text-base leading-none">{collapsed ? '»' : '«'}</span>
                </button>
            </div>
        </aside>
    )
}
