import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Download, ThumbsUp, Clock, Trash2 } from 'lucide-react'
import type { GameId, InstalledMod } from '../../../shared/types'
import { GAMES } from '../../../shared/types'
import { SearchClearButton } from './ui/SearchClearButton'
import { SkeletonCard } from './SkeletonCard'
import { Select } from './Select'
import { Button } from './ui/Button'
import { Toggle } from './Toggle'
import { Tooltip } from './Tooltip'
import { formatCount, formatRelativeTime } from './modDetail/format'
import { t } from '../i18n'
import { api } from '../api'

interface NexusModNode {
    modId: number
    name: string
    summary?: string
    pictureUrl?: string
    author?: string
    downloads?: number
    endorsements?: number
    updatedAt?: string
}

interface NexusResult {
    totalCount: number
    nodes: NexusModNode[]
}

interface Props {
    activeGame: GameId
    isActive: boolean
    gamePath: string | null
    installed: InstalledMod[]
    onRefreshInstalled: () => Promise<void>
    onGoToSettings: () => void
}

// Must match PAGE_SIZE in nexus.rs; page numbers translate to offsets here.
const PAGE_SIZE = 24

const SORT_OPTIONS = [
    { value: 'updatedAt', label: t('nexus.sort.lastUpdated') },
    { value: 'downloads', label: t('nexus.sort.mostDownloaded') },
    { value: 'endorsements', label: t('nexus.sort.mostEndorsed') },
    { value: 'relevance', label: t('nexus.sort.relevance') },
]

function getSavedSort(game: GameId): string {
    const saved = localStorage.getItem(`modrex:${GAMES[game].storageKey}:nexus-sort`)
    return SORT_OPTIONS.some((o) => o.value === saved) ? (saved as string) : 'updatedAt'
}

function buildPages(current: number, last: number): (number | '...')[] {
    const pages: (number | '...')[] = []
    const delta = 2
    const left = current - delta
    const right = current + delta

    let prev: number | null = null
    for (let p = 1; p <= last; p++) {
        if (p === 1 || p === last || (p >= left && p <= right)) {
            if (prev !== null && p - prev > 1) pages.push('...')
            pages.push(p)
            prev = p
        }
    }
    return pages
}

interface NexusModCardProps {
    mod: NexusModNode
    domain: string
    installed: InstalledMod | undefined
    busy: boolean
    progress: { downloaded: number; total: number } | null
    gamePath: string | null
    onUninstall: (ins: InstalledMod) => void
    onEnable: (ins: InstalledMod) => void
    onDisable: (ins: InstalledMod) => void
}

function NexusModCard({
    mod,
    domain,
    installed,
    busy,
    progress,
    gamePath,
    onUninstall,
    onEnable,
    onDisable,
}: NexusModCardProps) {
    const [thumbLoaded, setThumbLoaded] = useState(false)
    const canAct = !!gamePath && !busy

    const progressPct =
        progress && progress.total > 0
            ? Math.round((progress.downloaded / progress.total) * 100)
            : null

    // The files tab hosts "Mod Manager Download", which hands the download back
    // to Modrex via the nxm:// deep link, the sanctioned free-tier flow.
    function openOnNexus() {
        api.openExternal(`https://www.nexusmods.com/${domain}/mods/${mod.modId}?tab=files`)
    }

    return (
        <div className="h-full bg-surface-raised border border-border rounded-lg overflow-hidden flex flex-col transition-colors hover:border-accent/25">
            <div className="cursor-pointer group relative" onClick={openOnNexus}>
                {mod.pictureUrl ? (
                    <img
                        src={mod.pictureUrl}
                        alt={mod.name}
                        loading="lazy"
                        ref={(el) => {
                            if (el?.complete) setThumbLoaded(true)
                        }}
                        onLoad={() => setThumbLoaded(true)}
                        className={`w-full h-36 object-cover transition-opacity ${thumbLoaded ? '' : 'opacity-0'}${installed && !installed.enabled ? ' grayscale' : ''}`}
                    />
                ) : (
                    <div className="w-full h-36 bg-surface-hover flex items-center justify-center">
                        <span className="text-text-subtle text-xs">{t('common.noImage')}</span>
                    </div>
                )}
                <div className="px-3 pt-3 pb-1 flex flex-col gap-1">
                    <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-accent-bright transition-colors">
                        {mod.name}
                    </h3>
                    <p className="text-xs text-text-muted">{mod.author}</p>
                    <p className="text-xs text-text-subtle line-clamp-2">{mod.summary}</p>
                </div>
            </div>

            <div className="px-3 pb-3 pt-2 flex items-center justify-between mt-auto">
                {installed ? (
                    <>
                        <span className="text-xs text-text-subtle">{installed.version}</span>
                        <div className="flex items-center gap-2">
                            <Toggle
                                checked={installed.enabled}
                                onChange={(v) => (v ? onEnable(installed) : onDisable(installed))}
                                disabled={!canAct}
                            />
                            <Tooltip content={t('common.remove')}>
                                <Button
                                    variant="danger"
                                    size="icon-md"
                                    disabled={!canAct}
                                    onClick={() => onUninstall(installed)}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </Tooltip>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3 text-xs text-text-subtle">
                            {mod.downloads !== undefined && (
                                <span className="flex items-center gap-1">
                                    <Download className="w-3 h-3" />
                                    {formatCount(mod.downloads)}
                                </span>
                            )}
                            {mod.endorsements !== undefined && (
                                <span className="flex items-center gap-1">
                                    <ThumbsUp className="w-3 h-3" />
                                    {formatCount(mod.endorsements)}
                                </span>
                            )}
                            {mod.updatedAt && (
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatRelativeTime(mod.updatedAt)}
                                </span>
                            )}
                        </div>
                        {progress ? (
                            <Button variant="accent" size="sm" disabled>
                                {progressPct === null
                                    ? t('common.downloading')
                                    : progressPct < 100
                                      ? `${progressPct}%`
                                      : t('common.installing')}
                            </Button>
                        ) : (
                            <Button variant="accent" size="sm" onClick={openOnNexus}>
                                <Download className="w-3.5 h-3.5" />
                                {t('common.install')}
                            </Button>
                        )}
                    </>
                )}
            </div>

            {progress && !installed && (
                <div className="h-0.5 bg-surface-active">
                    {progress.total > 0 ? (
                        <div
                            className="h-full bg-accent transition-[width] duration-100"
                            style={{ width: `${progressPct}%` }}
                        />
                    ) : (
                        <div className="h-full bg-accent animate-pulse w-full" />
                    )}
                </div>
            )}
        </div>
    )
}

export function NexusBrowsePage({
    activeGame,
    isActive,
    gamePath,
    installed,
    onRefreshInstalled,
    onGoToSettings,
}: Props) {
    const domain = GAMES[activeGame].nexusDomain
    const [page, setPage] = useState(1)
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState(() => getSavedSort(activeGame))
    const [result, setResult] = useState<NexusResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null)
    const [busyUid, setBusyUid] = useState<string | null>(null)
    const [downloadMap, setDownloadMap] = useState<
        ReadonlyMap<number, { downloaded: number; total: number; fileId: number }>
    >(new Map())
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const fetchIdRef = useRef(0)
    const lastFetchedRef = useRef('')
    const scrollRef = useRef<HTMLDivElement>(null)

    // Nexus installs are tracked as id = -nexusModId with source "nexus".
    const installedByNexusId = useMemo(() => {
        const map = new Map<number, InstalledMod>()
        for (const m of installed) {
            if (m.source === 'nexus' && m.id < 0) map.set(-m.id, m)
        }
        return map
    }, [installed])

    async function runModAction(ins: InstalledMod, action: () => Promise<void>) {
        if (!gamePath) return
        setBusyUid(ins.uid)
        setError(null)
        try {
            await action()
            await onRefreshInstalled()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusyUid(null)
        }
    }

    function handleUninstall(ins: InstalledMod) {
        void runModAction(ins, () => api.uninstallMod(ins.uid, gamePath!, activeGame))
    }

    function handleEnable(ins: InstalledMod) {
        void runModAction(ins, () => api.enableMod(ins.uid, gamePath!, activeGame))
    }

    function handleDisable(ins: InstalledMod) {
        void runModAction(ins, () => api.disableMod(ins.uid, gamePath!, activeGame))
    }

    // The nxm:// handoff runs entirely in the backend; these listeners are what
    // make the browser-initiated download visible on the cards. Progress ids are
    // "nxm:{gameId}:{modId}:{fileId}"; Nexus mod ids repeat across game domains,
    // so events for other games must be ignored. Completion only clears the entry
    // when the file matches, so a second file of the same mod keeps its progress.
    // A failure payload carries no ids (it can occur before the link is even
    // parsed), so it clears everything.
    useEffect(() => {
        const offStarted = api.onNxmInstallStarted(({ gameId, modId, fileId }) => {
            if (gameId !== activeGame) return
            setDownloadMap((prev) => new Map(prev).set(modId, { downloaded: 0, total: 0, fileId }))
        })
        const offProgress = api.onDownloadProgress(({ download_id, downloaded, total }) => {
            const [prefix, gameId, modId, fileId] = download_id.split(':')
            if (prefix !== 'nxm' || gameId !== activeGame) return
            setDownloadMap((prev) =>
                new Map(prev).set(Number(modId), { downloaded, total, fileId: Number(fileId) })
            )
        })
        const offComplete = api.onNxmInstallComplete(({ gameId, modId, fileId }) => {
            if (gameId !== activeGame) return
            setDownloadMap((prev) => {
                if (prev.get(modId)?.fileId !== fileId) return prev
                const next = new Map(prev)
                next.delete(modId)
                return next
            })
        })
        const offFailed = api.onNxmInstallFailed((e) => {
            setError(e)
            setDownloadMap(new Map())
        })
        return () => {
            offStarted()
            offProgress()
            offComplete()
            offFailed()
        }
    }, [activeGame])

    // Re-checked on every activation so saving a key in Settings takes effect
    // without an app restart.
    useEffect(() => {
        if (!isActive) return
        let cancelled = false
        api.isNexusKeyConfigured().then((configured) => {
            if (!cancelled) setKeyConfigured(configured)
        })
        return () => {
            cancelled = true
        }
    }, [isActive])

    useEffect(() => {
        if (!isActive || keyConfigured !== true || !domain) return
        const filters = JSON.stringify([page, query, sort])
        // Successful results stay valid across tab switches; only param changes
        // or a prior failure warrant hitting the rate-limited API again.
        if (filters === lastFetchedRef.current && result !== null && !error) return
        if (filters !== lastFetchedRef.current) {
            if (scrollRef.current) scrollRef.current.scrollTop = 0
            setResult(null)
            setLoading(true)
        } else if (error) {
            setLoading(true)
        }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(
            async () => {
                const id = ++fetchIdRef.current
                lastFetchedRef.current = filters
                setError(null)
                try {
                    const data = await api.nexusSearchMods(
                        activeGame,
                        query,
                        sort,
                        (page - 1) * PAGE_SIZE
                    )
                    if (fetchIdRef.current !== id) return
                    setResult(data as NexusResult)
                    setLoading(false)
                } catch (e) {
                    if (fetchIdRef.current !== id) return
                    setError(String(e))
                    setLoading(false)
                }
            },
            query ? 400 : 0
        )
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- result/error are fetch outputs, not fetch inputs; domain/activeGame are stable per mount via key={activeGame}
    }, [isActive, keyConfigured, page, query, sort])

    function handleQueryChange(val: string) {
        setQuery(val)
        setPage(1)
    }

    function handleSortChange(val: string) {
        localStorage.setItem(`modrex:${GAMES[activeGame].storageKey}:nexus-sort`, val)
        setSort(val)
        setPage(1)
    }

    if (!domain) return null

    const lastPage = result ? Math.ceil(result.totalCount / PAGE_SIZE) : 0

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border shrink-0 flex flex-col gap-3">
                <h1 className="text-lg font-semibold">{t('nexus.title')}</h1>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle pointer-events-none" />
                        <input
                            type="text"
                            placeholder={t('nexus.searchPlaceholder')}
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            className={`w-full text-sm pl-8 py-1.5 rounded bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors ${query ? 'pr-7' : 'pr-3'}`}
                        />
                        {query && <SearchClearButton onClick={() => handleQueryChange('')} />}
                    </div>
                    <Select value={sort} onChange={handleSortChange} options={SORT_OPTIONS} />
                </div>
            </div>

            {error && (
                <div className="mx-6 mt-4 px-4 py-3 bg-danger/30 border border-danger-hover rounded text-sm text-danger-text">
                    {error}
                </div>
            )}

            {keyConfigured === false ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-text-subtle">
                    <span>{t('nexus.keyMissing')}</span>
                    <button
                        onClick={onGoToSettings}
                        className="text-xs text-accent hover:text-accent-bright underline transition-colors"
                    >
                        {t('nexus.goToSettings')}
                    </button>
                </div>
            ) : (
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
                    {loading ? (
                        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                            {Array.from({ length: 24 }, (_, i) => (
                                <SkeletonCard key={i} />
                            ))}
                        </div>
                    ) : !result ? (
                        <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                            {t('nexus.loadFailed')}
                        </div>
                    ) : result.nodes.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                            {t('nexus.noMods')}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                            {result.nodes.map((mod) => {
                                const ins = installedByNexusId.get(mod.modId)
                                return (
                                    <NexusModCard
                                        key={mod.modId}
                                        mod={mod}
                                        domain={domain}
                                        installed={ins}
                                        busy={ins !== undefined && ins.uid === busyUid}
                                        progress={downloadMap.get(mod.modId) ?? null}
                                        gamePath={gamePath}
                                        onUninstall={handleUninstall}
                                        onEnable={handleEnable}
                                        onDisable={handleDisable}
                                    />
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {result !== null && lastPage > 1 && (
                <div className="px-6 py-3 border-t border-border flex items-center justify-between shrink-0">
                    <span className="text-xs text-text-subtle">
                        {t('nexus.modCount', { total: result.totalCount })}
                    </span>
                    <div className="flex gap-1">
                        {buildPages(page, lastPage).map((p, i) =>
                            p === '...' ? (
                                <span
                                    key={`ellipsis-${i}`}
                                    className="text-xs px-2 py-1 text-text-subtle"
                                >
                                    …
                                </span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => setPage(p as number)}
                                    className={`text-xs px-3 py-1 rounded transition-colors ${
                                        p === page
                                            ? 'bg-accent text-white'
                                            : 'bg-surface-hover hover:bg-surface-active'
                                    }`}
                                >
                                    {p}
                                </button>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
