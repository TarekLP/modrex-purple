import { useState, useEffect, useCallback } from 'react'
import type { InstalledMod } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'
import { ModDetailPage } from './components/ModDetailPage'
import { SettingsPage } from './components/SettingsPage'
import { TopBar } from './components/TopBar'

export type View = 'browse' | 'installed' | 'detail' | 'settings'

export default function App() {
    const [view, setView] = useState<View>('browse')
    const [prevView, setPrevView] = useState<'browse' | 'installed'>('browse')
    const [detailStack, setDetailStack] = useState<number[]>([])
    const [gamePath, setGamePath] = useState<string | null>(null)
    const [installed, setInstalled] = useState<InstalledMod[]>([])

    const detailModId = detailStack[detailStack.length - 1] ?? null

    useEffect(() => {
        window.api.findGamePath().then(setGamePath)
    }, [])

    const refreshInstalled = useCallback(async () => {
        const state = await window.api.getInstalled()
        setInstalled(state.mods)
    }, [])

    useEffect(() => {
        refreshInstalled()
        window.addEventListener('focus', refreshInstalled)
        return () => window.removeEventListener('focus', refreshInstalled)
    }, [refreshInstalled])

    function openDetail(modId: number, from: 'browse' | 'installed') {
        setPrevView(from)
        setDetailStack([modId])
        setView('detail')
    }

    function pushDetail(modId: number) {
        setDetailStack((prev) => [...prev, modId])
    }

    function closeDetail() {
        if (detailStack.length <= 1) {
            setView(prevView)
            setDetailStack([])
        } else {
            setDetailStack((prev) => prev.slice(0, -1))
        }
    }

    const refreshGamePath = useCallback(async () => {
        const path = await window.api.findGamePath()
        setGamePath(path)
    }, [])

    function handleSidebarChange(v: 'browse' | 'installed' | 'settings') {
        setDetailStack([])
        setView(v)
    }

    const sidebarView = view === 'detail' ? prevView : (view as 'browse' | 'installed' | 'settings')

    return (
        <div className="flex flex-col h-screen bg-surface text-text">
            <TopBar gamePath={gamePath} onRefreshInstalled={refreshInstalled} />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar
                    view={sidebarView as 'browse' | 'installed' | 'settings'}
                    onViewChange={handleSidebarChange}
                />
                <main className="flex-1 overflow-hidden">
                    <div className={`h-full ${view === 'browse' ? '' : 'hidden'}`}>
                        <BrowsePage
                            gamePath={gamePath}
                            installed={installed}
                            onRefreshInstalled={refreshInstalled}
                            onOpenDetail={(id) => openDetail(id, 'browse')}
                        />
                    </div>
                    <div className={`h-full ${view === 'installed' ? '' : 'hidden'}`}>
                        <InstalledPage
                            gamePath={gamePath}
                            installed={installed}
                            onRefreshInstalled={refreshInstalled}
                            onOpenDetail={(id) => openDetail(id, 'installed')}
                        />
                    </div>
                    <div className={`h-full ${view === 'settings' ? '' : 'hidden'}`}>
                        <SettingsPage gamePath={gamePath} onGamePathChange={refreshGamePath} />
                    </div>
                    {view === 'detail' && detailModId !== null && (
                        <div className="h-full">
                            <ModDetailPage
                                modId={detailModId}
                                gamePath={gamePath}
                                installed={installed}
                                onBack={closeDetail}
                                onRefreshInstalled={refreshInstalled}
                                onOpenDetail={pushDetail}
                            />
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
