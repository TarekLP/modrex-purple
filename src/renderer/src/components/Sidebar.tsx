import { useState } from 'react'
import { Compass, Package, Settings, ChevronLeft, Gamepad2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { t } from '../i18n'
import type { StringKey } from '../i18n'
import type { GameId } from '../../../shared/types'
import { GAMES } from '../../../shared/types'

type NavView = 'browse' | 'installed' | 'settings'

interface Props {
    view: NavView
    onViewChange: (v: NavView) => void
    activeGame: GameId
    onShowWelcome: () => void
}

const navItems: { id: NavView; labelKey: StringKey; icon: LucideIcon }[] = [
    { id: 'browse', labelKey: 'sidebar.browse', icon: Compass },
    { id: 'installed', labelKey: 'sidebar.installed', icon: Package },
    { id: 'settings', labelKey: 'sidebar.settings', icon: Settings },
]

export function Sidebar({ view, onViewChange, activeGame, onShowWelcome }: Props) {
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('modrex:sidebar-collapsed') === 'true'
    )

    return (
        <aside
            className={`${collapsed ? 'w-12' : 'w-48'} shrink-0 flex flex-col bg-surface-raised border-r border-border transition-[width] duration-200 overflow-hidden`}
        >
            {/* Current game indicator */}
            <div className="p-2 border-b border-border shrink-0">
                <button
                    onClick={onShowWelcome}
                    title={collapsed ? GAMES[activeGame].name : t('sidebar.changeGame')}
                    className="w-full px-2 py-1.5 gap-2 flex items-center rounded text-xs text-text-subtle hover:bg-surface-hover hover:text-text transition-colors"
                >
                    <Gamepad2 className="w-4 h-4 shrink-0" />
                    <span
                        className={`truncate transition-opacity duration-200 font-medium ${collapsed ? 'opacity-0' : 'opacity-100'}`}
                    >
                        {GAMES[activeGame].shortName}
                    </span>
                </button>
            </div>

            <nav className="flex flex-col gap-1 p-2 flex-1">
                {navItems.map((item) => {
                    const Icon = item.icon
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            title={collapsed ? t(item.labelKey) : undefined}
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
                                {t(item.labelKey)}
                            </span>
                        </button>
                    )
                })}
            </nav>

            <div className="p-2 border-t border-border">
                <button
                    onClick={() =>
                        setCollapsed((c) => {
                            localStorage.setItem('modrex:sidebar-collapsed', String(!c))
                            return !c
                        })
                    }
                    title={collapsed ? t('sidebar.expandTitle') : t('sidebar.collapseTitle')}
                    className="w-full px-2 py-1.5 gap-2.5 flex items-center rounded text-xs text-text-subtle hover:bg-surface-hover hover:text-text transition-colors"
                >
                    <ChevronLeft
                        className={`w-4 h-4 shrink-0 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
                    />
                    <span
                        className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`}
                    >
                        {t('sidebar.collapse')}
                    </span>
                </button>
            </div>
        </aside>
    )
}
