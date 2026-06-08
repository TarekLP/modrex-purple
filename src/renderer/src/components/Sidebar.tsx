import { useState } from 'react'
import { Compass, Package, Settings, ChevronLeft, ArrowLeftRight, CircleHelp } from 'lucide-react'
import { api } from '../api'
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
            {/* Game switcher */}
            <div className="p-2 border-b border-border shrink-0">
                <button
                    onClick={onShowWelcome}
                    title={`${GAMES[activeGame].name} — ${t('sidebar.changeGame')}`}
                    className="w-full px-2 py-1.5 gap-2 flex items-center rounded text-xs hover:bg-surface-hover text-text hover:text-text transition-colors"
                >
                    <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-text-subtle" />
                    <span
                        className={`truncate transition-opacity duration-200 font-medium flex-1 text-left ${collapsed ? 'opacity-0' : 'opacity-100'}`}
                    >
                        {GAMES[activeGame].name}
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

            <div className="px-2 pb-1">
                <button
                    onClick={() => api.openExternal('https://modrex.net/docs/getting-started/')}
                    title={t('sidebar.docsTitle')}
                    className="w-full px-2 py-1.5 gap-2.5 flex items-center rounded text-xs text-text-subtle hover:bg-surface-hover hover:text-text transition-colors"
                >
                    <CircleHelp className="w-4 h-4 shrink-0" />
                    <span
                        className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`}
                    >
                        {t('sidebar.docs')}
                    </span>
                </button>
            </div>

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
