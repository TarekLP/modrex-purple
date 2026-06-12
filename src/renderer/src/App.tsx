import {
    useState,
    useEffect,
    useLayoutEffect,
    useCallback,
    memo,
    useRef,
    startTransition,
} from 'react'
import appIcon from '../../../assets/icon.png'
import { X, ExternalLink, Download } from 'lucide-react'
import type { InstalledMod, ModFolder, GameId, Mod } from '../../shared/types'
import { t } from './i18n'
import { MarkdownContent } from './components/MarkdownContent'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'
import { ModDetailPage } from './components/ModDetailPage'
import { SettingsPage } from './components/SettingsPage'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TopBar } from './components/TopBar'
import { api } from './api'
import { getSettingsCache, setSettingsCache } from './settingsCache'
import { Dialog } from './components/Dialog'
import { TooltipProvider } from './components/Tooltip'

const InstalledPageMemo = memo(InstalledPage)
const BrowsePageMemo = memo(BrowsePage)

// Warm the settings cache as soon as a game becomes active, so SettingsPage can
// render once with final values instead of showing provisional state that flips.
function warmSettingsCache(game: GameId) {
    if (getSettingsCache(game)) return
    Promise.all([api.getGameSettings(game), api.getInstalledLaunchers(game)])
        .then(([settings, installedLaunchers]) =>
            setSettingsCache(game, { settings, installedLaunchers })
        )
        .catch(() => {})
}

export type View = 'browse' | 'installed' | 'detail' | 'settings' | 'welcome'

const DETECT_RETRY_MS = 5 * 60 * 1000

function getInitialView(): View {
    if (!localStorage.getItem('modrex:active-game')) return 'welcome'
    const v = localStorage.getItem('modrex:active-view')
    return v === 'browse' || v === 'installed' || v === 'settings' ? v : 'browse'
}

export default function App() {
    const [view, setView] = useState<View>(getInitialView)
    const [prevView, setPrevView] = useState<'browse' | 'installed'>('browse')
    const [activeGame, setActiveGame] = useState<GameId>(() => {
        const saved = localStorage.getItem('modrex:active-game')
        if (saved === 'pd2' || saved === 'pdth') return saved
        return 'pd3'
    })
    const [detailStack, setDetailStack] = useState<{ modId: number; initialMod?: Mod }[]>([])
    const [gamePath, setGamePath] = useState<string | null>(null)
    // false while the active game's path is still being resolved this session —
    // consumers must not render "not found" states until this is true.
    const [gamePathReady, setGamePathReady] = useState(false)
    const [installed, setInstalled] = useState<InstalledMod[]>([])
    const [folders, setFolders] = useState<ModFolder[]>([])
    // Games whose installed list has been fetched at least once this session.
    // Empty set = startup splash; per-game membership gates the "no mods" empty state.
    const [readyGames, setReadyGames] = useState<ReadonlySet<GameId>>(new Set())
    const [modsHidden, setModsHidden] = useState(false)
    const [restoreError, setRestoreError] = useState<string | null>(null)
    const [update, setUpdate] = useState<{
        version: string
        strategy: 'auto' | 'manual' | 'browser'
        phase: 'available' | 'downloading' | 'ready'
        percent: number | null
        body: string
        releaseUrl: string
    } | null>(null)
    const [showUpdateModal, setShowUpdateModal] = useState(false)

    // Kept in sync with activeGame after every commit so async callbacks can detect staleness.
    const activeGameRef = useRef<GameId>(activeGame)
    useLayoutEffect(() => {
        activeGameRef.current = activeGame
    }, [activeGame])

    // Per-session cache: last resolved path for each game. undefined = not yet loaded.
    const gamePathCache = useRef<Partial<Record<GameId, string | null>>>({})

    // When detection failed for a game, when it failed. Re-detecting a missing
    // game runs a full launcher scan (Steam VDF walk, Epic manifests, Xbox drive
    // scan) — don't repeat it on every switch/focus, only after the TTL.
    const failedDetectAt = useRef<Partial<Record<GameId, number>>>({})

    // Per-session cache: last resolved installed state for each game. undefined = not yet loaded.
    const installedCache = useRef<
        Partial<Record<GameId, { mods: InstalledMod[]; folders: ModFolder[]; modsHidden: boolean }>>
    >({})

    const refreshGamePath = useCallback(async () => {
        const game = activeGame
        if (gamePathCache.current[game] === null) {
            const failedAt = failedDetectAt.current[game]
            if (failedAt !== undefined && Date.now() - failedAt < DETECT_RETRY_MS) {
                setGamePath(null)
                setGamePathReady(true)
                return
            }
        }
        const path = await api.findGamePath(game)
        if (activeGameRef.current !== game) return
        if (path === null) failedDetectAt.current[game] = Date.now()
        else delete failedDetectAt.current[game]
        gamePathCache.current[game] = path
        setGamePath(path)
        setGamePathReady(true)
    }, [activeGame])

    function handleShowWelcome() {
        setDetailStack([])
        setView('welcome')
    }

    function handleGameChange(g: GameId) {
        localStorage.setItem('modrex:active-game', g)
        const cachedPath = gamePathCache.current[g]
        const cachedInstalled = installedCache.current[g]
        const saved = localStorage.getItem('modrex:active-view')
        const dest: View =
            saved === 'browse' || saved === 'installed' || saved === 'settings' ? saved : 'browse'
        // The switch commit renders three pages' worth of tree at once — as a
        // transition it stays interruptible, so rapid switching can't pile up
        // janky frames (a newer switch cancels the in-progress render).
        startTransition(() => {
            setActiveGame(g)
            // Restore the last-known path for this game so the UI never flashes
            // "not found" while refreshGamePath re-validates in the background.
            setGamePath(cachedPath !== undefined ? cachedPath : null)
            setGamePathReady(cachedPath !== undefined)
            // Restore last-known installed state so the installed page never
            // flashes empty while refreshInstalled re-validates in the background.
            if (cachedInstalled) {
                setInstalled(cachedInstalled.mods)
                setFolders(cachedInstalled.folders)
                setModsHidden(cachedInstalled.modsHidden)
            } else {
                setInstalled([])
                setFolders([])
                setModsHidden(false)
            }
            setView(dest)
        })
    }

    const refreshInstalled = useCallback(async () => {
        const game = activeGame
        const result = await api.getInstalled(game)
        if (activeGameRef.current !== game) return
        // Unchanged result (the common case for focus refreshes) — skip the state
        // fan-out entirely: the fresh array refs would otherwise re-render the full
        // installed list and the browse grid for nothing. A cache hit implies this
        // game is already in readyGames.
        const prev = installedCache.current[game]
        if (prev && JSON.stringify(prev) === JSON.stringify(result)) return
        installedCache.current[game] = result
        setInstalled(result.mods)
        setFolders(result.folders)
        setModsHidden(result.modsHidden)
        setReadyGames((prev) => (prev.has(game) ? prev : new Set(prev).add(game)))
    }, [activeGame])

    async function handleRestoreMods() {
        setRestoreError(null)
        try {
            await api.restoreMods(activeGame)
            await refreshInstalled()
        } catch (e) {
            setRestoreError(String(e))
        }
    }

    // Path resolution must finish (persisting any newly detected path to settings)
    // before get_installed reads it — fetching concurrently can return a false-empty
    // list that gets cached as truth.
    const refreshAll = useCallback(async () => {
        try {
            await refreshGamePath()
        } catch {
            // detection failure must not block the installed fetch
        }
        await refreshInstalled()
    }, [refreshGamePath, refreshInstalled])

    // Manual path pick must bypass the failed-detection throttle — the user just
    // gave us a valid path, so the "not found" verdict is stale by definition.
    const handleGamePathSet = useCallback(async () => {
        delete failedDetectAt.current[activeGameRef.current]
        await refreshAll()
    }, [refreshAll])

    useEffect(() => {
        refreshAll()
        let timer: ReturnType<typeof setTimeout> | null = null
        function onFocus() {
            if (timer) clearTimeout(timer)
            timer = setTimeout(refreshAll, 500)
        }
        window.addEventListener('focus', onFocus)
        return () => {
            window.removeEventListener('focus', onFocus)
            if (timer) clearTimeout(timer)
        }
    }, [refreshAll])

    useEffect(() => {
        warmSettingsCache(activeGame)
    }, [activeGame])

    useEffect(() => {
        api.checkForUpdates().catch(() => {})
    }, [])

    useEffect(() => {
        const offAvailable = api.onUpdateAvailable(({ version, strategy, body, releaseUrl }) => {
            setUpdate({
                version,
                strategy,
                phase: 'available',
                percent: null,
                body,
                releaseUrl,
            })
            setShowUpdateModal(true)
        })
        const offProgress = api.onUpdateProgress((percent) =>
            setUpdate((prev) => (prev ? { ...prev, percent } : prev))
        )
        const offReady = api.onUpdateReady(() =>
            setUpdate((prev) => (prev ? { ...prev, phase: 'ready' } : prev))
        )
        return () => {
            offAvailable()
            offProgress()
            offReady()
        }
    }, [])

    async function handleUpdate() {
        if (!update) return
        setShowUpdateModal(false)
        setUpdate((prev) => (prev ? { ...prev, phase: 'downloading', percent: 0 } : prev))
        try {
            await api.download()
        } catch {
            setUpdate((prev) => (prev ? { ...prev, phase: 'available', percent: null } : prev))
            setShowUpdateModal(true)
        }
    }

    const openDetail = useCallback(
        (modId: number, from: 'browse' | 'installed', initialMod?: Mod) => {
            setPrevView(from)
            setDetailStack([{ modId, initialMod }])
            setView('detail')
        },
        []
    )

    const openDetailFromInstalled = useCallback(
        (id: number) => openDetail(id, 'installed'),
        [openDetail]
    )

    const pushDetail = useCallback((modId: number) => {
        setDetailStack((prev) => {
            const existingIndex = prev.findIndex((d) => d.modId === modId)
            if (existingIndex !== -1) return prev.slice(0, existingIndex + 1)
            return [...prev, { modId }]
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

    const handleSidebarChange = useCallback((v: 'browse' | 'installed' | 'settings') => {
        localStorage.setItem('modrex:active-view', v)
        setDetailStack([])
        setView(v)
    }, [])

    const openDetailFromBrowse = useCallback(
        (modId: number, initialMod?: Mod) => openDetail(modId, 'browse', initialMod),
        [openDetail]
    )

    const goToSettings = useCallback(() => handleSidebarChange('settings'), [handleSidebarChange])

    const sidebarView = view === 'detail' ? prevView : (view as 'browse' | 'installed' | 'settings')

    return (
        <TooltipProvider delayDuration={400}>
            <div className="flex flex-col h-screen bg-surface text-text">
                {readyGames.size === 0 && (
                    <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center gap-4 z-50">
                        <img src={appIcon} alt="Modrex" className="w-16 h-16 opacity-90" />
                        <span
                            style={{
                                fontFamily: "'Bebas Neue', sans-serif",
                                fontSize: '2.5rem',
                                letterSpacing: '0.05em',
                                lineHeight: 1,
                            }}
                        >
                            <span style={{ color: 'var(--color-text)' }}>MOD</span>
                            <span style={{ color: 'var(--color-accent)' }}>REX</span>
                        </span>
                        <div className="w-6 h-6 rounded-full border-2 border-border border-t-accent animate-spin" />
                    </div>
                )}
                {view === 'welcome' ? (
                    <WelcomeScreen onSelectGame={handleGameChange} />
                ) : (
                    <>
                        <TopBar
                            gamePath={gamePath}
                            activeGame={activeGame}
                            onRefreshInstalled={refreshInstalled}
                            update={
                                update && update.phase !== 'available'
                                    ? { phase: update.phase, percent: update.percent }
                                    : null
                            }
                            onDismissUpdate={() => setUpdate(null)}
                        />
                        {modsHidden && (
                            <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 bg-warning/10 border-b border-warning/30 text-xs text-warning">
                                <span>{t('app.modsHidden')}</span>
                                <div className="flex items-center gap-3 shrink-0">
                                    {restoreError && (
                                        <span className="text-danger-text">{restoreError}</span>
                                    )}
                                    <button
                                        onClick={handleRestoreMods}
                                        className="px-3 py-1 rounded bg-warning/20 hover:bg-warning/30 transition-colors"
                                    >
                                        {t('app.restoreMods')}
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-1 overflow-hidden">
                            <Sidebar
                                view={sidebarView as 'browse' | 'installed' | 'settings'}
                                onViewChange={handleSidebarChange}
                                activeGame={activeGame}
                                onShowWelcome={handleShowWelcome}
                            />
                            {/* Pages are stacked absolute panes toggled with visibility, not
                                display:none — un-hiding a display:none subtree re-layouts it
                                from scratch and re-decodes every image, which made tab switches
                                stutter. A visibility flip is paint-only. */}
                            <main className="relative flex-1 overflow-hidden">
                                <div
                                    className={`absolute inset-0 ${view === 'browse' ? '' : 'invisible pointer-events-none'}`}
                                >
                                    <BrowsePageMemo
                                        key={activeGame}
                                        activeGame={activeGame}
                                        isActive={view === 'browse'}
                                        gamePath={gamePath}
                                        gamePathReady={gamePathReady}
                                        installed={installed}
                                        onRefreshInstalled={refreshInstalled}
                                        onOpenDetail={openDetailFromBrowse}
                                        onGoToSettings={goToSettings}
                                    />
                                </div>
                                <div
                                    className={`absolute inset-0 ${view === 'installed' ? '' : 'invisible pointer-events-none'}`}
                                >
                                    <InstalledPageMemo
                                        activeGame={activeGame}
                                        gamePath={gamePath}
                                        installed={installed}
                                        folders={folders}
                                        installedReady={readyGames.has(activeGame)}
                                        onRefreshInstalled={refreshInstalled}
                                        onOpenDetail={openDetailFromInstalled}
                                    />
                                </div>
                                <div
                                    className={`absolute inset-0 ${view === 'settings' ? '' : 'invisible pointer-events-none'}`}
                                >
                                    <SettingsPage
                                        key={activeGame}
                                        activeGame={activeGame}
                                        gamePath={gamePath}
                                        gamePathReady={gamePathReady}
                                        onGamePathChange={handleGamePathSet}
                                    />
                                </div>
                                {detailStack.map(({ modId, initialMod }, i) => (
                                    <div
                                        key={modId}
                                        className={`absolute inset-0 ${view === 'detail' && i === detailStack.length - 1 ? '' : 'invisible pointer-events-none'}`}
                                    >
                                        <ModDetailPage
                                            modId={modId}
                                            initialMod={initialMod}
                                            isActive={
                                                view === 'detail' && i === detailStack.length - 1
                                            }
                                            gamePath={gamePath}
                                            installed={installed}
                                            activeGame={activeGame}
                                            onBack={closeDetail}
                                            onRefreshInstalled={refreshInstalled}
                                            onOpenDetail={pushDetail}
                                        />
                                    </div>
                                ))}
                            </main>
                        </div>
                    </>
                )}

                <Dialog
                    open={showUpdateModal && !!update && update.phase === 'available'}
                    onOpenChange={(open) => !open && setShowUpdateModal(false)}
                    title={update ? t('app.updateNotesTitle', { version: update.version }) : ''}
                    className="w-full max-w-lg max-h-[80vh]"
                >
                    {update && (
                        <>
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                                <h2 className="text-sm font-semibold">
                                    {t('app.updateNotesTitle', { version: update.version })}
                                </h2>
                                <button
                                    onClick={() => setShowUpdateModal(false)}
                                    className="text-text-subtle hover:text-text transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            {update.body && (
                                <div className="overflow-y-auto px-5 py-4 flex-1">
                                    <MarkdownContent text={update.body} />
                                </div>
                            )}
                            <div className="px-5 py-4 border-t border-border shrink-0 flex items-center justify-between">
                                <button
                                    onClick={() => api.openExternal(update.releaseUrl)}
                                    className="flex items-center gap-1.5 text-xs text-text-subtle hover:text-text transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    {t('app.updateViewOnGithub')}
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowUpdateModal(false)}
                                        className="text-xs px-3 py-1 rounded border border-border bg-surface-hover hover:bg-surface-active transition-colors"
                                    >
                                        {t('app.updateLater')}
                                    </button>
                                    {update.strategy !== 'browser' ? (
                                        <button
                                            onClick={handleUpdate}
                                            className="text-xs px-3 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent transition-colors flex items-center gap-1.5"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            {t('app.updateAction')}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => api.openExternal(update.releaseUrl)}
                                            className="text-xs px-3 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent transition-colors flex items-center gap-1.5"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            {t('app.updateDownload')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </Dialog>
            </div>
        </TooltipProvider>
    )
}
