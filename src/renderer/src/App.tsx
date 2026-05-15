import { useState, useEffect, useCallback, memo } from 'react'
import type { InstalledMod } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'
import { ModDetailPage } from './components/ModDetailPage'
import { SettingsPage } from './components/SettingsPage'
import { TopBar } from './components/TopBar'

const BrowsePageMemo = memo(BrowsePage)
const InstalledPageMemo = memo(InstalledPage)

export type View = 'browse' | 'installed' | 'detail' | 'settings'

export default function App() {
    const [view, setView] = useState<View>('browse')
    const [prevView, setPrevView] = useState<'browse' | 'installed'>('browse')
    const [detailStack, setDetailStack] = useState<number[]>([])
    const [gamePath, setGamePath] = useState<string | null>(null)
    const [installed, setInstalled] = useState<InstalledMod[]>([])
    const [installedReady, setInstalledReady] = useState(false)
    const [modsHidden, setModsHidden] = useState(false)
    const [restoreError, setRestoreError] = useState<string | null>(null)

    useEffect(() => {
        window.api.findGamePath().then(setGamePath)
    }, [])

    const refreshInstalled = useCallback(async () => {
        const { mods, modsHidden } = await window.api.getInstalled()
        setInstalled(mods)
        setModsHidden(modsHidden)
        setInstalledReady(true)
    }, [])

    async function handleRestoreMods() {
        setRestoreError(null)
        try {
            await window.api.restoreMods()
            await refreshInstalled()
        } catch (e) {
            setRestoreError(String(e))
        }
    }

    useEffect(() => {
        refreshInstalled()
        window.addEventListener('focus', refreshInstalled)
        return () => window.removeEventListener('focus', refreshInstalled)
    }, [refreshInstalled])

    const openDetail = useCallback((modId: number, from: 'browse' | 'installed') => {
        setPrevView(from)
        setDetailStack([modId])
        setView('detail')
    }, [])

    const openDetailFromBrowse = useCallback((id: number) => openDetail(id, 'browse'), [openDetail])
    const openDetailFromInstalled = useCallback(
        (id: number) => openDetail(id, 'installed'),
        [openDetail]
    )

    const pushDetail = useCallback((modId: number) => {
        setDetailStack((prev) => {
            const existingIndex = prev.indexOf(modId)
            if (existingIndex !== -1) return prev.slice(0, existingIndex + 1)
            return [...prev, modId]
        })
    }, [])

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
            {modsHidden && (
                <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 bg-yellow-400/10 border-b border-yellow-400/30 text-xs text-yellow-400">
                    <span>
                        Mods are hidden — the game was launched in vanilla mode and may still be
                        running.
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                        {restoreError && <span className="text-danger-text">{restoreError}</span>}
                        <button
                            onClick={handleRestoreMods}
                            className="px-3 py-1 rounded bg-yellow-400/20 hover:bg-yellow-400/30 transition-colors"
                        >
                            Restore mods
                        </button>
                    </div>
                </div>
            )}
            <div className="flex flex-1 overflow-hidden">
                <Sidebar
                    view={sidebarView as 'browse' | 'installed' | 'settings'}
                    onViewChange={handleSidebarChange}
                />
                <main className="flex-1 overflow-hidden">
                    <div className={`h-full ${view === 'browse' ? '' : 'hidden'}`}>
                        <BrowsePageMemo
                            gamePath={gamePath}
                            installed={installed}
                            onRefreshInstalled={refreshInstalled}
                            onOpenDetail={openDetailFromBrowse}
                        />
                    </div>
                    <div className={`h-full ${view === 'installed' ? '' : 'hidden'}`}>
                        <InstalledPageMemo
                            gamePath={gamePath}
                            installed={installed}
                            installedReady={installedReady}
                            onRefreshInstalled={refreshInstalled}
                            onOpenDetail={openDetailFromInstalled}
                        />
                    </div>
                    <div className={`h-full ${view === 'settings' ? '' : 'hidden'}`}>
                        <SettingsPage gamePath={gamePath} onGamePathChange={refreshGamePath} />
                    </div>
                    {detailStack.map((modId, i) => (
                        <div
                            key={modId}
                            className={`h-full ${view === 'detail' && i === detailStack.length - 1 ? '' : 'hidden'}`}
                        >
                            <ModDetailPage
                                modId={modId}
                                isActive={view === 'detail' && i === detailStack.length - 1}
                                gamePath={gamePath}
                                installed={installed}
                                onBack={closeDetail}
                                onRefreshInstalled={refreshInstalled}
                                onOpenDetail={pushDetail}
                            />
                        </div>
                    ))}
                </main>
            </div>
        </div>
    )
}
