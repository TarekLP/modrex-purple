import { useState } from 'react'
import { Compass, Package, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
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
            className={`${collapsed ? 'w-12' : 'w-48'} shrink-0 flex flex-col bg-surface-raised border-r border-border transition-[width] duration-200`}
        >
            <nav className={`flex flex-col gap-1 p-2 flex-1 ${collapsed ? 'items-center' : ''}`}>
                {navItems.map((item) => {
                    const Icon = item.icon
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            title={collapsed ? item.label : undefined}
                            className={`transition-colors rounded text-sm ${
                                collapsed
                                    ? `w-8 h-8 flex items-center justify-center ${
                                          view === item.id
                                              ? 'bg-surface-active text-text'
                                              : 'text-text-muted hover:bg-surface-hover hover:text-text'
                                      }`
                                    : `w-full text-left px-3 py-2 flex items-center gap-2.5 ${
                                          view === item.id
                                              ? 'bg-surface-active text-text'
                                              : 'text-text-muted hover:bg-surface-hover hover:text-text'
                                      }`
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            {!collapsed && item.label}
                        </button>
                    )
                })}
            </nav>

            <div className="p-2 border-t border-border">
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={`w-full flex items-center py-1.5 rounded text-xs text-text-subtle hover:bg-surface-hover hover:text-text transition-colors ${collapsed ? 'justify-center' : 'justify-between px-2'}`}
                >
                    {!collapsed && <span>Collapse</span>}
                    {collapsed ? (
                        <ChevronRight className="w-4 h-4" />
                    ) : (
                        <ChevronLeft className="w-4 h-4" />
                    )}
                </button>
            </div>
        </aside>
    )
}
