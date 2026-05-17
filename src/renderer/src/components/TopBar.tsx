import { useState, useEffect, useRef } from 'react'
import { Play, Square, TriangleAlert, X, RefreshCw } from 'lucide-react'
import { t } from '../i18n'

interface UpdateState {
    phase: 'downloading' | 'ready'
    percent: number | null
}

interface Props {
    gamePath: string | null
    onRefreshInstalled: () => Promise<void>
    update?: UpdateState | null
    onDismissUpdate?: () => void
}

export function TopBar({ gamePath, onRefreshInstalled, update, onDismissUpdate }: Props) {
    const [gameRunning, setGameRunning] = useState(false)
    const [showWarning, setShowWarning] = useState(false)
    const [dontShowAgain, setDontShowAgain] = useState(false)
    const [launchError, setLaunchError] = useState<string | null>(null)
    const wasRunning = useRef(false)

    useEffect(() => {
        const check = async () => {
            const running = await window.api.isGameRunning()
            if (wasRunning.current && !running) {
                try {
                    await window.api.restoreMods()
                } catch (e) {
                    setLaunchError(String(e))
                }
                await onRefreshInstalled()
            }
            wasRunning.current = running
            setGameRunning(running)
        }
        check()
        const id = setInterval(check, 3000)
        return () => clearInterval(id)
    }, [onRefreshInstalled])

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

    async function launchWithoutMods() {
        if (!gamePath) return
        try {
            await window.api.launchWithoutMods(gamePath)
        } catch (e) {
            setLaunchError(String(e))
        }
    }

    function stopGame() {
        window.api.stopGame()
    }

    return (
        <>
            {launchError && (
                <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-danger border-b border-danger-hover text-xs text-danger-text">
                    <span>{launchError}</span>
                    <button
                        onClick={() => setLaunchError(null)}
                        className="shrink-0 hover:text-text transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
            <div className="shrink-0 bg-surface border-b border-border">
                <div className="h-10 flex items-center justify-between px-4">
                    <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold tracking-widest uppercase text-accent-bright">
                            {t('topBar.title')}
                        </span>
                        <span className="text-xs text-text-subtle">
                            {import.meta.env.DEV ? 'v-dev' : `v${import.meta.env.VITE_APP_VERSION}`}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {update?.phase === 'ready' && (
                            <>
                                <button
                                    onClick={() => window.api.installUpdate()}
                                    className="text-xs px-3 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent transition-colors flex items-center gap-1.5"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    {t('app.updateInstall')}
                                </button>
                                <button
                                    onClick={onDismissUpdate}
                                    className="p-1 rounded text-text-subtle hover:text-text hover:bg-surface-hover transition-colors"
                                    title={t('common.dismiss')}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                                <div className="w-px h-4 bg-border mx-1" />
                            </>
                        )}
                        {gameRunning ? (
                            <button
                                onClick={stopGame}
                                className="text-xs px-3 py-1 rounded bg-danger hover:bg-danger-hover transition-colors flex items-center gap-1.5"
                            >
                                <Square className="w-3.5 h-3.5" fill="currentColor" />
                                {t('topBar.stopGame')}
                            </button>
                        ) : (
                            <>
                                <button
                                    disabled={!gamePath}
                                    onClick={launchWithoutMods}
                                    className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                                >
                                    <Play className="w-3.5 h-3.5" fill="currentColor" />
                                    {t('topBar.launchWithoutMods')}
                                </button>
                                <button
                                    disabled={!gamePath}
                                    onClick={handleLaunchModded}
                                    className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                                >
                                    <Play className="w-3.5 h-3.5" fill="currentColor" />
                                    {t('topBar.launchModded')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {update?.phase === 'downloading' && (
                    <div className="h-0.5 bg-surface-hover">
                        <div
                            className="h-full bg-accent transition-all duration-300"
                            style={{ width: `${update.percent ?? 0}%` }}
                        />
                    </div>
                )}
            </div>

            {showWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-surface-raised border border-border rounded-lg shadow-xl w-96 p-6 flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <TriangleAlert className="w-4 h-4 text-yellow-400 shrink-0" />
                                {t('topBar.missingLaunchOption.title')}
                            </h2>
                            <p className="text-xs text-text-muted">
                                <span className="font-mono text-text">-fileopenlog</span>{' '}
                                {t('topBar.missingLaunchOption.bodyPre')}{' '}
                                <span className="text-text">
                                    {t('topBar.missingLaunchOption.location')}
                                </span>
                                .
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
                                <span className="text-xs text-text-muted">
                                    {t('common.dontShowAgain')}
                                </span>
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowWarning(false)}
                                    className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={confirmLaunch}
                                    className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright transition-colors"
                                >
                                    {t('topBar.missingLaunchOption.launchAnyway')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
