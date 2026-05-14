import { useState, useEffect, useCallback } from 'react'
import type { InstalledMod } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'
import { TopBar } from './components/TopBar'

export type View = 'browse' | 'installed'

export default function App() {
    const [view, setView] = useState<View>('browse')
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

    return (
        <div className="flex flex-col h-screen bg-surface text-text">
            <TopBar gamePath={gamePath} />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar view={view} onViewChange={setView} />
                <main className="flex-1 overflow-hidden">
                    <div className={`h-full ${view === 'browse' ? '' : 'hidden'}`}>
                        <BrowsePage
                            gamePath={gamePath}
                            installed={installed}
                            onRefreshInstalled={refreshInstalled}
                        />
                    </div>
                    <div className={`h-full ${view === 'installed' ? '' : 'hidden'}`}>
                        <InstalledPage
                            gamePath={gamePath}
                            installed={installed}
                            onRefreshInstalled={refreshInstalled}
                        />
                    </div>
                </main>
            </div>
        </div>
    )
}
