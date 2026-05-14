import { useState, useEffect } from 'react'

interface Props {
    gamePath: string | null
}

export function TopBar({ gamePath }: Props) {
    const [gameRunning, setGameRunning] = useState(false)

    useEffect(() => {
        const check = () => window.api.isGameRunning().then(setGameRunning)
        check()
        const id = setInterval(check, 3000)
        return () => clearInterval(id)
    }, [])

    function launchModded() {
        window.api.launchModded()
    }

    function launchWithoutMods() {
        if (!gamePath) return
        window.api.launchWithoutMods(gamePath)
    }

    function stopGame() {
        window.api.stopGame()
    }

    return (
        <div className="h-10 shrink-0 flex items-center justify-end gap-2 px-4 bg-surface border-b border-border">
            {gameRunning ? (
                <button
                    onClick={stopGame}
                    className="text-xs px-3 py-1 rounded bg-danger hover:bg-danger-hover transition-colors"
                >
                    Stop game
                </button>
            ) : (
                <>
                    <button
                        disabled={!gamePath}
                        onClick={launchWithoutMods}
                        className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Launch without mods
                    </button>
                    <button
                        onClick={launchModded}
                        className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright transition-colors"
                    >
                        Launch modded
                    </button>
                </>
            )}
        </div>
    )
}
