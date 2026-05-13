import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'

export type View = 'browse' | 'installed'

export default function App() {
    const [view, setView] = useState<View>('browse')
    const [gamePath, setGamePath] = useState<string | null>(null)

    useEffect(() => {
        window.api.findGamePath().then(setGamePath)
    }, [])

    return (
        <div className="flex h-screen bg-zinc-950 text-zinc-100">
            <Sidebar view={view} onViewChange={setView} />
            <main className="flex-1 overflow-hidden">
                {view === 'browse' && <BrowsePage gamePath={gamePath} />}
                {view === 'installed' && <InstalledPage gamePath={gamePath} />}
            </main>
        </div>
    )
}
