import { useState, useEffect, useCallback, useRef, startTransition } from 'react'
import { Search, X } from 'lucide-react'
import type {
    Mod,
    ModFile,
    Paginated,
    InstalledMod,
    Category,
    ModDependency,
    SortOption,
} from '../../../shared/types'
import { GAME_STORAGE_KEY } from '../../../shared/types'
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
import { isUnsupportedFormat } from '../formatCheck'
import { t } from '../i18n'
import { api } from '../api'

interface Props {
    gamePath: string | null
    installed: InstalledMod[]
    onRefreshInstalled: () => Promise<void>
    onOpenDetail: (modId: number) => void
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

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'bumped_at', label: t('browse.sort.lastUpdated') },
    { value: 'downloads', label: t('browse.sort.mostDownloaded') },
    { value: 'likes', label: t('browse.sort.mostLiked') },
    { value: 'published_at', label: t('browse.sort.newest') },
    { value: 'name', label: t('browse.sort.name') },
]

function getSavedSort(): SortOption {
    const saved = localStorage.getItem(`modrex:${GAME_STORAGE_KEY}:browse-sort`)
    return SORT_OPTIONS.some((o) => o.value === saved) ? (saved as SortOption) : 'bumped_at'
}

export function BrowsePage({
    gamePath,
    installed,
    onRefreshInstalled,
    onOpenDetail,
    onGoToSettings,
}: Props) {
    const [page, setPage] = useState(1)
    const [query, setQuery] = useState('')
    const [categoryId, setCategoryId] = useState<number | undefined>()
    const initialSort = getSavedSort()
    const [sort, setSort] = useState<SortOption>(initialSort)
    const initialCache = getBrowseCache(1, '', initialSort, undefined)
    const [result, setResult] = useState<Paginated<Mod> | null>(initialCache?.result ?? null)
    const [categories, setCategories] = useState<Category[]>(() => getCategoriesCache() ?? [])
    const [loadingMods, setLoadingMods] = useState(!initialCache)
    const [loadingMod, setLoadingMod] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [depsWarning, setDepsWarning] = useState<{
        modId: number
        allDeps: ModDependency[]
    } | null>(null)
    const [fileSelect, setFileSelect] = useState<{ mod: Mod; files: ModFile[] } | null>(null)
    const [formatWarning, setFormatWarning] = useState<{ modId: number; mod: Mod } | null>(null)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const progressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return api.onDownloadProgress(({ downloaded, total }) => {
            setDownloadProgress({ downloaded, total })
            if (progressClearTimer.current) clearTimeout(progressClearTimer.current)
            progressClearTimer.current = setTimeout(() => setDownloadProgress(null), 800)
        })
    }, [])

    const fetchMods = useCallback(
        async (p: number, q: string, cat: number | undefined, s: SortOption) => {
            const cached = getBrowseCache(p, q, s, cat)
            if (cached) {
                setResult(cached.result)
                if (!cached.stale) return
            } else {
                setLoadingMods(true)
            }
            setError(null)
            try {
                const data = await api.listMods({
                    page: p,
                    limit: 24,
                    sort: s,
                    query: q || undefined,
                    category_id: cat,
                })
                setBrowseCache(p, q, s, cat, data)
                startTransition(() => {
                    setResult(data)
                    setLoadingMods(false)
                })
            } catch (e) {
                setError(String(e))
                setLoadingMods(false)
            }
        },
        []
    )

    useEffect(() => {
        const cached = getCategoriesCache()
        if (cached) {
            setCategories(cached)
            return
        }
        api.listCategories().then((r) => {
            setCategoriesCache(r.data)
            setCategories(r.data)
        })
    }, [])

    useEffect(() => {
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
    }, [fetchMods, page, query, categoryId, sort])

    function handleQueryChange(val: string) {
        setQuery(val)
        setPage(1)
    }

    function handleCategoryChange(val: string) {
        setCategoryId(val ? Number(val) : undefined)
        setPage(1)
    }

    function handleSortChange(val: string) {
        localStorage.setItem(`modrex:${GAME_STORAGE_KEY}:browse-sort`, val)
        setSort(val as SortOption)
        setPage(1)
    }

    function handlePrefetch(modId: number) {
        if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current)
        prefetchTimerRef.current = setTimeout(() => {
            getCachedMod(modId).catch(() => {})
            getCachedModFiles(modId).catch(() => {})
            getCachedModLinks(modId).catch(() => {})
        }, 150)
    }

    async function handleInstall(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            const fullMod = await getCachedMod(modId)
            if (fullMod.disable_mod_managers) {
                setError(t('common.modManagerDisabled'))
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
            } else {
                setError(errStr)
            }
        } finally {
            setLoadingMod(null)
        }
    }

    async function doInstall(modId: number, fullMod: Mod) {
        if (!gamePath) return
        if (!sessionStorage.getItem(`depsWarningDismissed-${modId}`)) {
            const allDeps = [
                ...(fullMod.dependencies ?? []),
                ...(fullMod.instructs_template?.dependencies ?? []),
            ]
            const missingRequired = allDeps.filter(
                (d) => !d.optional && !installed.some((m) => m.id === d.mod.id)
            )
            if (missingRequired.length > 0) {
                const s = await api.getSettings()
                if (!s.dismissedDepsWarnings?.includes(modId)) {
                    setLoadingMod(null)
                    setDepsWarning({ modId, allDeps })
                    return
                }
            }
        }
        await api.installMod(modId, gamePath)
        await onRefreshInstalled()
    }

    async function handleUninstall(modId: number) {
        if (!gamePath) return
        const uids = installed.filter((m) => m.id === modId).map((m) => m.uid)
        if (uids.length === 0) return
        setLoadingMod(modId)
        try {
            for (const uid of uids) await api.uninstallMod(uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(modId: number) {
        if (!gamePath) return
        const uids = installed.filter((m) => m.id === modId).map((m) => m.uid)
        if (uids.length === 0) return
        setLoadingMod(modId)
        try {
            for (const uid of uids) await api.enableMod(uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(modId: number) {
        if (!gamePath) return
        const uids = installed.filter((m) => m.id === modId).map((m) => m.uid)
        if (uids.length === 0) return
        setLoadingMod(modId)
        try {
            for (const uid of uids) await api.disableMod(uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    const missingDepsList = depsWarning
        ? depsWarning.allDeps.filter(
              (d) => !d.optional && !installed.some((m) => m.id === d.mod.id)
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
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setFileSelect(null)}
                />
            )}
            {zipPickerData && gamePath && (
                <ZipPickerModal
                    payload={zipPickerData}
                    gamePath={gamePath}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setZipPickerData(null)}
                />
            )}
            {depsWarning && (
                <DepsWarningModal
                    modId={depsWarning.modId}
                    missingRequired={missingDepsList}
                    gamePath={gamePath}
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
                    {!gamePath && (
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

            {error && (
                <div className="mx-6 mt-4 px-4 py-3 bg-danger/30 border border-danger-hover rounded text-sm text-danger-text">
                    {error}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {loadingMods || !result ? (
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                        {Array.from({ length: 24 }, (_, i) => (
                            <SkeletonCard key={i} />
                        ))}
                    </div>
                ) : result.data.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        {t('browse.noMods')}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                        {result.data.map((mod) => (
                            <ModCard
                                key={mod.id}
                                mod={mod}
                                installed={installed.find((m) => m.id === mod.id)}
                                installedCount={
                                    installed.filter((m) => m.id === mod.id).length || undefined
                                }
                                gamePath={gamePath}
                                loading={loadingMod === mod.id}
                                progress={loadingMod === mod.id ? downloadProgress : null}
                                showMeta
                                onOpen={() => onOpenDetail(mod.id)}
                                onPrefetch={() => handlePrefetch(mod.id)}
                                onInstall={() => handleInstall(mod.id)}
                                onUninstall={() => handleUninstall(mod.id)}
                                onEnable={() => handleEnable(mod.id)}
                                onDisable={() => handleDisable(mod.id)}
                            />
                        ))}
                    </div>
                )}
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
