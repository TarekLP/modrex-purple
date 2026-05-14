import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'
import { TopBar } from './components/TopBar'

export type View = 'browse' | 'installed'

export default function App() {
    const [view, setView] = useState<View>('browse')
    const [gamePath, setGamePath] = useState<string | null>(null)

    useEffect(() => {
        window.api.findGamePath().then(setGamePath)
    }, [])

    return (
        <div className="flex flex-col h-screen bg-surface text-text">
            <TopBar gamePath={gamePath} />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar view={view} onViewChange={setView} />
                <main className="flex-1 overflow-hidden">
                    <div className={`h-full ${view === 'browse' ? '' : 'hidden'}`}>
                        <BrowsePage gamePath={gamePath} />
                    </div>
                    <div className={`h-full ${view === 'installed' ? '' : 'hidden'}`}>
                        <InstalledPage gamePath={gamePath} />
                    </div>
                </main>
            </div>
        </div>
    )
}
