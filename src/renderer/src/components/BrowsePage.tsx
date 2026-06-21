import { useState, useEffect, useCallback, useRef, useMemo, memo, startTransition } from 'react'
import { Search, X } from 'lucide-react'
import type {
    Mod,
    ModFile,
    Paginated,
    InstalledMod,
    Category,
    ModDependency,
    SortOption,
    GameId,
} from '../../../shared/types'
import { GAMES } from '../../../shared/types'
import { getCachedMod, getCachedModFiles, getCachedModLinks } from '../modCache'
import {
    getBrowseCache,
    setBrowseCache,
    getCategoriesCache,
    setCategoriesCache,
} from '../browseCache'
import { ModCard } from './ModCard'
import { SkeletonCard } from './SkeletonCard'
import { Select } from './Select'
import { DepsWarningModal } from './DepsWarningModal'
import { FileSelectModal } from './FileSelectModal'
import { NonPakConfirmModal } from './NonPakConfirmModal'
import { ZipPickerModal, parseZipMultiPak } from './ZipPickerModal'
import type { ZipMultiPakPayload } from './ZipPickerModal'
import { HostPackModal, parseHostModPack } from './HostPackModal'
import type { HostPackPayload } from './HostPackModal'
import { UnrecognizedArchiveModal, isUnrecognizedArchive } from './UnrecognizedArchiveModal'
import { isUnsupportedFormat } from '../formatCheck'
import { collectDeps, isLoaderDep, missingRequiredDeps } from '../deps'
import { t } from '../i18n'
import { api } from '../api'
import { trackSearch } from '../lib/analytics/events'
import { markForegroundActivity, waitForForegroundClear } from '../requestPriority'

interface Props {
    activeGame: GameId
    isActive: boolean
    gamePath: string | null
    gamePathReady: boolean
    installed: InstalledMod[]
    onRefreshInstalled: () => Promise<void>
    onOpenDetail: (modId: number, initialMod?: Mod) => void
    onGoToSettings?: () => void
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

// api.rs's api_get formats a rate-limit failure as "modworkshop API 429: <path>"
// after exhausting its own retries — matches "API 429" specifically (not just
// "429") so a 429 appearing inside a path segment in some other error doesn't
// false-positive.
function isRateLimitError(error: string): boolean {
    return error.includes('API 429')
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'bumped_at', label: t('browse.sort.lastUpdated') },
    { value: 'downloads', label: t('browse.sort.mostDownloaded') },
    { value: 'likes', label: t('browse.sort.mostLiked') },
    { value: 'published_at', label: t('browse.sort.newest') },
    { value: 'name', label: t('browse.sort.name') },
]

// Memo boundary for the card grid. The grid is the expensive part of BrowsePage
// (24 cards × tooltips/toggles/images), so it must only re-render when its data
// actually changes — not on isActive flips, search keystrokes, or modal/error
// state. All handler props must stay useCallback-stable in BrowsePage or the
// boundary is defeated. GridCard keeps the per-card closures inside its own memo
// so a grid re-render (e.g. download progress) only re-renders the affected card.
interface CardHandlers {
    onOpen: (modId: number, initialMod?: Mod) => void
    onPrefetch: (modId: number) => void
    onInstall: (modId: number) => void
    onUninstall: (modId: number) => void
    onEnable: (modId: number) => void
    onDisable: (modId: number) => void
}

interface GridCardProps extends CardHandlers {
    mod: Mod
    installed: InstalledMod | undefined
    installedCount: number | undefined
    gamePath: string | null
    loading: boolean
    progress: { downloaded: number; total: number } | null
    loaderInstalled?: boolean
}

const GridCard = memo(function GridCard(p: GridCardProps) {
    return (
        <ModCard
            mod={p.mod}
            installed={p.installed}
            installedCount={p.installedCount}
            loaderInstalled={p.loaderInstalled}
            gamePath={p.gamePath}
            loading={p.loading}
            progress={p.progress}
            showMeta
            onOpen={() => p.onOpen(p.mod.id, p.mod)}
            onPrefetch={() => p.onPrefetch(p.mod.id)}
            onInstall={() => p.onInstall(p.mod.id)}
            onUninstall={() => p.onUninstall(p.mod.id)}
            onEnable={() => p.onEnable(p.mod.id)}
            onDisable={() => p.onDisable(p.mod.id)}
        />
    )
})

interface ModGridProps extends CardHandlers {
    loadingMods: boolean
    result: Paginated<Mod> | null
    installedByModId: Map<number, InstalledMod[]>
    gamePath: string | null
    loadingMod: number | null
    downloadProgress: { downloaded: number; total: number } | null
    loaderInstalledIds: Set<number>
}

const ModGrid = memo(function ModGrid({
    loadingMods,
    result,
    installedByModId,
    gamePath,
    loadingMod,
    downloadProgress,
    loaderInstalledIds,
    ...handlers
}: ModGridProps) {
    if (loadingMods) {
        return (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 24 }, (_, i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        )
    }
    if (!result) {
        // Cold start with nothing cached and the fetch failed — without this,
        // loadingMods=false + result=null fell through to the skeleton branch
        // above and rendered placeholder cards forever.
        return (
            <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                {t('browse.loadFailed')}
            </div>
        )
    }
    if (result.data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                {t('browse.noMods')}
            </div>
        )
    }
    return (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {result.data.map((mod) => (
                <GridCard
                    key={mod.id}
                    mod={mod}
                    installed={installedByModId.get(mod.id)?.[0]}
                    installedCount={installedByModId.get(mod.id)?.length || undefined}
                    loaderInstalled={loaderInstalledIds.has(mod.id) ? true : undefined}
                    gamePath={gamePath}
                    loading={loadingMod === mod.id}
                    progress={loadingMod === mod.id ? downloadProgress : null}
                    {...handlers}
                />
            ))}
        </div>
    )
})

function getSavedSort(game: GameId): SortOption {
    const saved = localStorage.getItem(`modrex:${GAMES[game].storageKey}:browse-sort`)
    return SORT_OPTIONS.some((o) => o.value === saved) ? (saved as SortOption) : 'bumped_at'
}

export function BrowsePage({
    activeGame,
    isActive,
    gamePath,
    gamePathReady,
    installed,
    onRefreshInstalled,
    onOpenDetail,
    onGoToSettings,
}: Props) {
    const [page, setPage] = useState(1)
    const [query, setQuery] = useState('')
    const [categoryId, setCategoryId] = useState<number | undefined>()
    const workshopId = GAMES[activeGame].workshopId
    const initialSort = getSavedSort(activeGame)
    const [sort, setSort] = useState<SortOption>(initialSort)
    const initialCache = getBrowseCache(workshopId, 1, '', initialSort, undefined)
    const [result, setResult] = useState<Paginated<Mod> | null>(initialCache?.result ?? null)
    const [categories, setCategories] = useState<Category[]>(
        () => getCategoriesCache(workshopId) ?? []
    )
    const [loadingMods, setLoadingMods] = useState(!initialCache)
    const [loadingMod, setLoadingMod] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [depsWarning, setDepsWarning] = useState<{
        modId: number
        allDeps: ModDependency[]
        bltLoaderInstalled: boolean | null
    } | null>(null)
    const [fileSelect, setFileSelect] = useState<{ mod: Mod; files: ModFile[] } | null>(null)
    const [formatWarning, setFormatWarning] = useState<{ modId: number; mod: Mod } | null>(null)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)
    const [hostPackData, setHostPackData] = useState<HostPackPayload | null>(null)
    const [unrecognizedModId, setUnrecognizedModId] = useState<number | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const progressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [pdthOverridesInstalled, setPdthOverridesInstalled] = useState<boolean | null>(null)
    const [dahmInstalled, setDahmInstalled] = useState<boolean | null>(null)
    const [ue4ssInstalled, setUe4ssInstalled] = useState<boolean | null>(null)

    useEffect(() => {
        return api.onDownloadProgress(({ downloaded, total }) => {
            setDownloadProgress({ downloaded, total })
            if (progressClearTimer.current) clearTimeout(progressClearTimer.current)
            progressClearTimer.current = setTimeout(() => setDownloadProgress(null), 800)
        })
    }, [])

    useEffect(() => {
        if (!gamePath) return
        let cancelled = false
        if (activeGame === 'pdth') {
            api.checkPdthOverrides(gamePath).then((v) => {
                if (!cancelled) setPdthOverridesInstalled(v)
            })
            api.checkDahm(gamePath).then((v) => {
                if (!cancelled) setDahmInstalled(v)
            })
        }
        if (activeGame === 'cb' || activeGame === 'pd3') {
            api.checkUe4ss(gamePath, activeGame).then((v) => {
                if (!cancelled) setUe4ssInstalled(v)
            })
        }
        return () => {
            cancelled = true
        }
    }, [gamePath]) // eslint-disable-line react-hooks/exhaustive-deps -- activeGame is stable per mount; BrowsePage remounts on game change via key={activeGame}

    const fetchMods = useCallback(
        async (p: number, q: string, cat: number | undefined, s: SortOption) => {
            const cached = getBrowseCache(workshopId, p, q, s, cat)
            if (cached) {
                setResult(cached.result)
                if (!cached.stale) return
            } else {
                setLoadingMods(true)
            }
            setError(null)
            markForegroundActivity()
            try {
                const data = await api.listMods(workshopId, {
                    page: p,
                    limit: 24,
                    sort: s,
                    query: q || undefined,
                    category_id: cat,
                })
                setBrowseCache(workshopId, p, q, s, cat, data)
                if (q) trackSearch(activeGame, q.length, data.meta.total)
                startTransition(() => {
                    setResult(data)
                    setLoadingMods(false)
                })
            } catch (e) {
                setError(String(e))
                setLoadingMods(false)
            } finally {
                markForegroundActivity()
            }
        },
        [workshopId, activeGame] // both stable per mount — BrowsePage remounts on game change via key={activeGame}
    )

    useEffect(() => {
        const cached = getCategoriesCache(workshopId)
        if (cached) {
            setCategories(cached)
            return
        }
        api.listCategories(workshopId).then((r) => {
            setCategoriesCache(workshopId, r.data)
            setCategories(r.data)
        })
    }, [workshopId]) // stable per mount — BrowsePage remounts on game change via key={activeGame}

    // Fetches only while the page is visible. Re-runs on activation (isActive
    // false → true) so stale cache entries get a background refresh — fresh ones
    // early-return inside fetchMods. Scroll resets only on a filter change, not
    // on activation, so the position survives tab switches.
    const lastFiltersRef = useRef('')
    useEffect(() => {
        if (!isActive) return
        const filters = JSON.stringify([page, query, categoryId, sort])
        if (filters !== lastFiltersRef.current) {
            lastFiltersRef.current = filters
            if (scrollRef.current) scrollRef.current.scrollTop = 0
        }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(
            () => {
                fetchMods(page, query, categoryId, sort)
            },
            query ? 400 : 0
        )
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [isActive, fetchMods, page, query, categoryId, sort])

    function handleQueryChange(val: string) {
        setQuery(val)
        setPage(1)
    }

    function handleCategoryChange(val: string) {
        setCategoryId(val ? Number(val) : undefined)
        setPage(1)
    }

    function handleSortChange(val: string) {
        localStorage.setItem(`modrex:${GAMES[activeGame].storageKey}:browse-sort`, val)
        setSort(val as SortOption)
        setPage(1)
    }

    const handlePrefetch = useCallback((modId: number) => {
        if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current)
        prefetchTimerRef.current = setTimeout(() => {
            waitForForegroundClear().then(() => {
                getCachedMod(modId).catch(() => {})
                getCachedModFiles(modId).catch(() => {})
                getCachedModLinks(modId).catch(() => {})
            })
        }, 150)
    }, [])

    const doInstall = useCallback(
        async (modId: number, fullMod: Mod) => {
            if (!gamePath) return
            if (!sessionStorage.getItem(`depsWarningDismissed-${modId}`)) {
                const allDeps = collectDeps(fullMod)
                const pdthLoaderModIds: Record<number, boolean | null> =
                    activeGame === 'pdth'
                        ? { 53474: pdthOverridesInstalled, 14267: dahmInstalled }
                        : {}
                const hasLoader =
                    activeGame === 'pdth'
                        ? allDeps.some(
                              (d) => d.mod !== null && (d.mod.id === 53474 || d.mod.id === 14267)
                          )
                        : allDeps.some(isLoaderDep)
                const bltLoaderInstalled =
                    hasLoader && activeGame !== 'pdth' ? await api.checkSuperblt(gamePath) : null
                const missingRequired = missingRequiredDeps(
                    allDeps,
                    installed,
                    bltLoaderInstalled,
                    pdthLoaderModIds
                )
                if (missingRequired.length > 0) {
                    const s = await api.getSettings()
                    if (!s.dismissedDepsWarnings?.includes(modId)) {
                        setLoadingMod(null)
                        setDepsWarning({ modId, allDeps, bltLoaderInstalled })
                        return
                    }
                }
            }
            const isUe4ssLoader =
                (activeGame === 'cb' && modId === 47749) ||
                (activeGame === 'pd3' && modId === 47771)
            if (activeGame === 'pdth' && modId === 53474) {
                await api.installPdthOverrides(gamePath)
                setPdthOverridesInstalled(true)
            } else if (activeGame === 'pdth' && modId === 14267) {
                await api.installDahm(gamePath)
                setDahmInstalled(true)
            } else {
                await api.installMod(modId, gamePath, activeGame)
                // The loader package isn't tracked in the installed list — its own install
                // (routed server-side via the UE4SS_LOADER sentinel) succeeds without an error,
                // so a successful call here is the confirmation; mirrors the optimistic
                // pdthOverrides/dahm updates above instead of waiting on a fresh presence check.
                if (isUe4ssLoader) setUe4ssInstalled(true)
            }
            await onRefreshInstalled()
        },
        [gamePath, installed, activeGame, pdthOverridesInstalled, dahmInstalled, onRefreshInstalled]
    )

    const handleInstall = useCallback(
        async (modId: number) => {
            if (!gamePath) return
            setError(null)
            setLoadingMod(modId)
            try {
                const fullMod = await getCachedMod(modId)
                if (fullMod.disable_mod_managers) {
                    setError(t('common.modManagerDisabled'))
                    return
                }
                if (fullMod.download?.url && !fullMod.download.download_url) {
                    api.openExternal(fullMod.download.url)
                    return
                }
                let checkType: string | undefined
                let checkUrl: string | undefined
                if (fullMod.download === null) {
                    const files = await getCachedModFiles(modId)
                    if (files.length > 1) {
                        setLoadingMod(null)
                        setFileSelect({ mod: fullMod, files })
                        return
                    }
                    checkType = files[0]?.type
                    checkUrl = files[0]?.download_url
                } else {
                    checkType = fullMod.download.type
                    checkUrl = fullMod.download.download_url ?? undefined
                }
                if (isUnsupportedFormat(checkType, checkUrl)) {
                    setLoadingMod(null)
                    setFormatWarning({ modId, mod: fullMod })
                    return
                }
                await doInstall(modId, fullMod)
            } catch (e) {
                const errStr = String(e)
                const zipData = parseZipMultiPak(errStr)
                if (zipData) {
                    setZipPickerData(zipData)
                    return
                }
                const hostData = parseHostModPack(errStr)
                if (hostData) {
                    setHostPackData(hostData)
                    return
                }
                if (isUnrecognizedArchive(errStr)) {
                    setUnrecognizedModId(modId)
                    return
                }
                setError(errStr)
            } finally {
                setLoadingMod(null)
            }
        },
        [gamePath, doInstall]
    )

    const handleUninstall = useCallback(
        async (modId: number) => {
            if (!gamePath) return
            const uids = installed.filter((m) => m.id === modId).map((m) => m.uid)
            if (uids.length === 0) return
            setLoadingMod(modId)
            try {
                for (const uid of uids) await api.uninstallMod(uid, gamePath, activeGame)
                await onRefreshInstalled()
            } finally {
                setLoadingMod(null)
            }
        },
        [gamePath, installed, activeGame, onRefreshInstalled]
    )

    const handleEnable = useCallback(
        async (modId: number) => {
            if (!gamePath) return
            const uids = installed.filter((m) => m.id === modId).map((m) => m.uid)
            if (uids.length === 0) return
            setLoadingMod(modId)
            try {
                for (const uid of uids) await api.enableMod(uid, gamePath, activeGame)
                await onRefreshInstalled()
            } finally {
                setLoadingMod(null)
            }
        },
        [gamePath, installed, activeGame, onRefreshInstalled]
    )

    const handleDisable = useCallback(
        async (modId: number) => {
            if (!gamePath) return
            const uids = installed.filter((m) => m.id === modId).map((m) => m.uid)
            if (uids.length === 0) return
            setLoadingMod(modId)
            try {
                for (const uid of uids) await api.disableMod(uid, gamePath, activeGame)
                await onRefreshInstalled()
            } finally {
                setLoadingMod(null)
            }
        },
        [gamePath, installed, activeGame, onRefreshInstalled]
    )

    const installedByModId = useMemo(() => {
        const map = new Map<number, InstalledMod[]>()
        for (const m of installed) {
            const list = map.get(m.id)
            if (list) list.push(m)
            else map.set(m.id, [m])
        }
        return map
    }, [installed])

    const pdthLoaderModIds: Record<number, boolean | null> =
        activeGame === 'pdth' ? { 53474: pdthOverridesInstalled, 14267: dahmInstalled } : {}
    const missingDepsList = depsWarning
        ? missingRequiredDeps(
              depsWarning.allDeps,
              installed,
              depsWarning.bltLoaderInstalled,
              pdthLoaderModIds
          )
        : []

    return (
        <div className="h-full flex flex-col">
            {formatWarning && (
                <NonPakConfirmModal
                    onConfirm={async () => {
                        const { modId, mod: fullMod } = formatWarning
                        setFormatWarning(null)
                        setLoadingMod(modId)
                        try {
                            await doInstall(modId, fullMod)
                        } catch (e) {
                            setError(String(e))
                        } finally {
                            setLoadingMod(null)
                        }
                    }}
                    onCancel={() => setFormatWarning(null)}
                />
            )}
            {fileSelect && (
                <FileSelectModal
                    mod={fileSelect.mod}
                    files={fileSelect.files}
                    gamePath={gamePath}
                    installedFiles={installed.filter((m) => m.id === fileSelect.mod.id)}
                    gameId={activeGame}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setFileSelect(null)}
                />
            )}
            {zipPickerData && gamePath && (
                <ZipPickerModal
                    payload={zipPickerData}
                    gamePath={gamePath}
                    installedFiles={installed}
                    gameId={activeGame}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setZipPickerData(null)}
                />
            )}
            {hostPackData && gamePath && (
                <HostPackModal
                    payload={hostPackData}
                    gamePath={gamePath}
                    installed={installed}
                    gameId={activeGame}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setHostPackData(null)}
                />
            )}
            {unrecognizedModId !== null && (
                <UnrecognizedArchiveModal
                    modId={unrecognizedModId}
                    onClose={() => setUnrecognizedModId(null)}
                />
            )}
            {depsWarning && (
                <DepsWarningModal
                    modId={depsWarning.modId}
                    missingRequired={missingDepsList}
                    gamePath={gamePath}
                    gameId={activeGame}
                    loaderModIds={activeGame === 'pdth' ? [53474, 14267] : []}
                    onInstallLoader={async (loaderModId) => {
                        if (!gamePath) return
                        try {
                            if (loaderModId === 53474) {
                                await api.installPdthOverrides(gamePath)
                                setPdthOverridesInstalled(true)
                            } else if (loaderModId === 14267) {
                                await api.installDahm(gamePath)
                                setDahmInstalled(true)
                            } else {
                                await api.installSuperblt(gamePath)
                                setDepsWarning((w) => (w ? { ...w, bltLoaderInstalled: true } : w))
                            }
                        } catch (e) {
                            setError(String(e))
                        }
                    }}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setDepsWarning(null)}
                    onGotIt={async (permanent) => {
                        sessionStorage.setItem(`depsWarningDismissed-${depsWarning.modId}`, '1')
                        if (permanent) await api.dismissDepsWarning(depsWarning.modId)
                        setDepsWarning(null)
                    }}
                />
            )}
            <div className="px-6 py-4 border-b border-border shrink-0 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg font-semibold">{t('browse.title')}</h1>
                    {gamePathReady && !gamePath && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-warning bg-warning/10 px-3 py-1 rounded">
                                {t('browse.gameNotFound')}
                            </span>
                            {onGoToSettings && (
                                <button
                                    onClick={onGoToSettings}
                                    className="text-xs text-accent hover:text-accent-bright underline transition-colors"
                                >
                                    {t('browse.goToSettings')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle pointer-events-none" />
                        <input
                            type="text"
                            placeholder={t('browse.searchPlaceholder')}
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            className={`w-full text-sm pl-8 py-1.5 rounded bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors ${query ? 'pr-7' : 'pr-3'}`}
                        />
                        {query && (
                            <button
                                onClick={() => handleQueryChange('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <Select
                        value={categoryId?.toString() ?? ''}
                        onChange={handleCategoryChange}
                        placeholder={t('browse.allCategories')}
                        options={[
                            { value: '', label: t('browse.allCategories') },
                            ...categories.map((c) => ({ value: String(c.id), label: c.name })),
                        ]}
                    />
                    <Select
                        value={sort}
                        onChange={handleSortChange}
                        options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    />
                </div>
            </div>

            {error &&
                (isRateLimitError(error) ? (
                    <div className="mx-6 mt-4 px-4 py-3 bg-warning/10 border border-warning/30 rounded text-sm text-warning">
                        {t('browse.rateLimited')}
                    </div>
                ) : (
                    <div className="mx-6 mt-4 px-4 py-3 bg-danger/30 border border-danger-hover rounded text-sm text-danger-text">
                        {error}
                    </div>
                ))}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
                <ModGrid
                    loadingMods={loadingMods}
                    result={result}
                    installedByModId={installedByModId}
                    gamePath={gamePath}
                    loadingMod={loadingMod}
                    downloadProgress={downloadProgress}
                    loaderInstalledIds={
                        new Set([
                            ...(pdthOverridesInstalled ? [53474] : []),
                            ...(dahmInstalled ? [14267] : []),
                            ...(ue4ssInstalled && activeGame === 'cb' ? [47749] : []),
                            ...(ue4ssInstalled && activeGame === 'pd3' ? [47771] : []),
                        ])
                    }
                    onOpen={onOpenDetail}
                    onPrefetch={handlePrefetch}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onEnable={handleEnable}
                    onDisable={handleDisable}
                />
            </div>

            {result && result.meta.last_page > 1 && (
                <div className="px-6 py-3 border-t border-border flex items-center justify-between shrink-0">
                    <span className="text-xs text-text-subtle">
                        {result.meta.total > 0 &&
                            t('browse.modCount', { total: result.meta.total })}
                    </span>
                    <div className="flex gap-1">
                        {buildPages(page, result.meta.last_page).map((p, i) =>
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
