import { useState, useEffect, useCallback, memo } from 'react'
import appIcon from '../../../assets/icon.png'
import { X, ExternalLink, Download } from 'lucide-react'
import type { InstalledMod, ModFolder } from '../../shared/types'
import { t } from './i18n'
import { MarkdownContent } from './components/MarkdownContent'
import { Sidebar } from './components/Sidebar'
import { BrowsePage } from './components/BrowsePage'
import { InstalledPage } from './components/InstalledPage'
import { ModDetailPage } from './components/ModDetailPage'
import { SettingsPage } from './components/SettingsPage'
import { TopBar } from './components/TopBar'
import { api } from './api'

const InstalledPageMemo = memo(InstalledPage)

export type View = 'browse' | 'installed' | 'detail' | 'settings'

function getSavedView(): View {
    const v = localStorage.getItem('modrex:active-view')
    return v === 'browse' || v === 'installed' || v === 'settings' ? v : 'browse'
}

export default function App() {
    const [view, setView] = useState<View>(getSavedView)
    const [prevView, setPrevView] = useState<'browse' | 'installed'>('browse')
    const [detailStack, setDetailStack] = useState<number[]>([])
    const [gamePath, setGamePath] = useState<string | null>(null)
    const [installed, setInstalled] = useState<InstalledMod[]>([])
    const [folders, setFolders] = useState<ModFolder[]>([])
    const [installedReady, setInstalledReady] = useState(false)
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

    const refreshGamePath = useCallback(async () => {
        const path = await api.findGamePath()
        setGamePath(path)
    }, [])

    const refreshInstalled = useCallback(async () => {
        const { mods, folders, modsHidden } = await api.getInstalled()
        setInstalled(mods)
        setFolders(folders)
        setModsHidden(modsHidden)
        setInstalledReady(true)
    }, [])

    async function handleRestoreMods() {
        setRestoreError(null)
        try {
            await api.restoreMods()
            await refreshInstalled()
        } catch (e) {
            setRestoreError(String(e))
        }
    }

    useEffect(() => {
        refreshGamePath()
        refreshInstalled()
        let timer: ReturnType<typeof setTimeout> | null = null
        function onFocus() {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                refreshGamePath()
                refreshInstalled()
            }, 500)
        }
        window.addEventListener('focus', onFocus)
        return () => {
            window.removeEventListener('focus', onFocus)
            if (timer) clearTimeout(timer)
        }
    }, [refreshGamePath, refreshInstalled])

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

    const openDetail = useCallback((modId: number, from: 'browse' | 'installed') => {
        setPrevView(from)
        setDetailStack([modId])
        setView('detail')
    }, [])

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

    function handleSidebarChange(v: 'browse' | 'installed' | 'settings') {
        localStorage.setItem('modrex:active-view', v)
        setDetailStack([])
        setView(v)
    }

    const sidebarView = view === 'detail' ? prevView : (view as 'browse' | 'installed' | 'settings')

    return (
        <div className="flex flex-col h-screen bg-surface text-text">
            {!installedReady && (
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
            <TopBar
                gamePath={gamePath}
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
                        {restoreError && <span className="text-danger-text">{restoreError}</span>}
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
                />
                <main className="flex-1 overflow-hidden">
                    {view === 'browse' && (
                        <div className="h-full">
                            <BrowsePage
                                gamePath={gamePath}
                                installed={installed}
                                onRefreshInstalled={refreshInstalled}
                                onOpenDetail={(id) => openDetail(id, 'browse')}
                                onGoToSettings={() => handleSidebarChange('settings')}
                            />
                        </div>
                    )}
                    <div className={`h-full ${view === 'installed' ? '' : 'hidden'}`}>
                        <InstalledPageMemo
                            gamePath={gamePath}
                            installed={installed}
                            folders={folders}
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

            {showUpdateModal && update && update.phase === 'available' && (
                <div
                    className="absolute inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={(e) => e.target === e.currentTarget && setShowUpdateModal(false)}
                >
                    <div className="bg-surface-raised border border-border rounded-xl w-full max-w-lg mx-6 flex flex-col overflow-hidden max-h-[80vh]">
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
                                    className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active transition-colors"
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
                    </div>
                </div>
            )}
        </div>
    )
}
