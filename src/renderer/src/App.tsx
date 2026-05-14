import { useState, useEffect, useCallback } from 'react'
import type { InstalledMod } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'
import { ModDetailPage } from './components/ModDetailPage'
import { TopBar } from './components/TopBar'

export type View = 'browse' | 'installed' | 'detail'

export default function App() {
    const [view, setView] = useState<View>('browse')
    const [prevView, setPrevView] = useState<'browse' | 'installed'>('browse')
    const [detailModId, setDetailModId] = useState<number | null>(null)
    const [gamePath, setGamePath] = useState<string | null>(null)
    const [installed, setInstalled] = useState<InstalledMod[]>([])

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
        setDetailModId(modId)
        setView('detail')
    }

    function closeDetail() {
        setView(prevView)
        setDetailModId(null)
    }

    function handleSidebarChange(v: 'browse' | 'installed') {
        setDetailModId(null)
        setView(v)
    }

    const sidebarView = view === 'detail' ? prevView : view

    return (
        <div className="flex flex-col h-screen bg-surface text-text">
            <TopBar gamePath={gamePath} />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar view={sidebarView} onViewChange={handleSidebarChange} />
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
                    {view === 'detail' && detailModId !== null && (
                        <div className="h-full">
                            <ModDetailPage
                                modId={detailModId}
                                gamePath={gamePath}
                                installed={installed}
                                onBack={closeDetail}
                                onRefreshInstalled={refreshInstalled}
                            />
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
