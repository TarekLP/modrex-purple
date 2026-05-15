import { useState, useEffect } from 'react'
import { Play, Square, TriangleAlert } from 'lucide-react'

interface Props {
    gamePath: string | null
}

export function TopBar({ gamePath }: Props) {
    const [gameRunning, setGameRunning] = useState(false)
    const [showWarning, setShowWarning] = useState(false)
    const [dontShowAgain, setDontShowAgain] = useState(false)

    useEffect(() => {
        const check = () => window.api.isGameRunning().then(setGameRunning)
        check()
        const id = setInterval(check, 3000)
        return () => clearInterval(id)
    }, [])

    async function handleLaunchModded() {
        const settings = await window.api.getSettings()
        if (!settings.skipFileOpenLogWarning && !settings.launchOptions?.includes('-fileopenlog')) {
            setDontShowAgain(false)
            setShowWarning(true)
            return
        }
        window.api.launchModded()
    }

    async function confirmLaunch() {
        if (dontShowAgain) await window.api.setSkipFileOpenLogWarning(true)
        setShowWarning(false)
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
        <>
            <div className="h-10 shrink-0 flex items-center justify-between px-4 bg-surface border-b border-border">
                <span className="text-sm font-bold tracking-widest uppercase text-accent-bright">
                    PD3 Mod Manager
                </span>
                <div className="flex items-center gap-2">
                    {gameRunning ? (
                        <button
                            onClick={stopGame}
                            className="text-xs px-3 py-1 rounded bg-danger hover:bg-danger-hover transition-colors flex items-center gap-1.5"
                        >
                            <Square className="w-3.5 h-3.5" fill="currentColor" />
                            Stop game
                        </button>
                    ) : (
                        <>
                            <button
                                disabled={!gamePath}
                                onClick={launchWithoutMods}
                                className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                            >
                                <Play className="w-3.5 h-3.5" fill="currentColor" />
                                Launch without mods
                            </button>
                            <button
                                onClick={handleLaunchModded}
                                className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright transition-colors flex items-center gap-1.5"
                            >
                                <Play className="w-3.5 h-3.5" fill="currentColor" />
                                Launch modded
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-surface-raised border border-border rounded-lg shadow-xl w-96 p-6 flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <TriangleAlert className="w-4 h-4 text-yellow-400 shrink-0" />
                                Missing launch option
                            </h2>
                            <p className="text-xs text-text-muted">
                                <span className="font-mono text-text">-fileopenlog</span> is
                                required for mods to load correctly. Add it in{' '}
                                <span className="text-text">Settings → Launch Options</span>.
                            </p>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={dontShowAgain}
                                    onChange={(e) => setDontShowAgain(e.target.checked)}
                                    className="accent-accent"
                                />
                                <span className="text-xs text-text-muted">Don't show again</span>
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowWarning(false)}
                                    className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmLaunch}
                                    className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright transition-colors"
                                >
                                    Launch anyway
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
