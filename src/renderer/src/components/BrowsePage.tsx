import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, X } from 'lucide-react'
import type {
    Mod,
    ModFile,
    Paginated,
    InstalledMod,
    Category,
    ModDependency,
} from '../../../shared/types'
import { getCachedMod } from '../modCache'
import type { SortOption } from '../../../main/api'
import { ModCard } from './ModCard'
import { Select } from './Select'
import { DepsWarningModal } from './DepsWarningModal'
import { FileSelectModal } from './FileSelectModal'

interface Props {
    gamePath: string | null
    installed: InstalledMod[]
    onRefreshInstalled: () => Promise<void>
    onOpenDetail: (modId: number) => void
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
    { value: 'bumped_at', label: 'Last Updated' },
    { value: 'downloads', label: 'Most Downloaded' },
    { value: 'likes', label: 'Most Liked' },
    { value: 'published_at', label: 'Newest' },
    { value: 'name', label: 'Name' },
]

export function BrowsePage({ gamePath, installed, onRefreshInstalled, onOpenDetail }: Props) {
    const [page, setPage] = useState(1)
    const [query, setQuery] = useState('')
    const [categoryId, setCategoryId] = useState<number | undefined>()
    const [sort, setSort] = useState<SortOption>('bumped_at')
    const [result, setResult] = useState<Paginated<Mod> | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [loadingMods, setLoadingMods] = useState(false)
    const [loadingMod, setLoadingMod] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [depsWarning, setDepsWarning] = useState<{
        modId: number
        allDeps: ModDependency[]
    } | null>(null)
    const [fileSelect, setFileSelect] = useState<{ mod: Mod; files: ModFile[] } | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const progressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return window.api.onDownloadProgress(({ downloaded, total }) => {
            setDownloadProgress({ downloaded, total })
            if (progressClearTimer.current) clearTimeout(progressClearTimer.current)
            progressClearTimer.current = setTimeout(() => setDownloadProgress(null), 800)
        })
    }, [])

    const fetchMods = useCallback(
        async (p: number, q: string, cat: number | undefined, s: SortOption) => {
            setLoadingMods(true)
            setError(null)
            try {
                const data = await window.api.listMods({
                    page: p,
                    limit: 24,
                    sort: s,
                    query: q || undefined,
                    category_id: cat,
                })
                setResult(data)
            } catch (e) {
                setError(String(e))
            } finally {
                setLoadingMods(false)
            }
        },
        []
    )

    useEffect(() => {
        window.api.listCategories().then((r) => setCategories(r.data))
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
        setSort(val as SortOption)
        setPage(1)
    }

    async function handleInstall(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            const fullMod = await getCachedMod(modId)
            if (fullMod.download === null) {
                const filesData = await window.api.listModFiles(modId)
                if (filesData.data.length > 1) {
                    setLoadingMod(null)
                    setFileSelect({ mod: fullMod, files: filesData.data })
                    return
                }
            }
            if (!sessionStorage.getItem(`depsWarningDismissed-${modId}`)) {
                const allDeps = [
                    ...(fullMod.dependencies ?? []),
                    ...(fullMod.instructs_template?.dependencies ?? []),
                ]
                const missingRequired = allDeps.filter(
                    (d) => !d.optional && !installed.some((m) => m.id === d.mod.id)
                )
                if (missingRequired.length > 0) {
                    const s = await window.api.getSettings()
                    if (!s.dismissedDepsWarnings?.includes(modId)) {
                        setLoadingMod(null)
                        setDepsWarning({ modId, allDeps })
                        return
                    }
                }
            }
            await window.api.installMod(modId, gamePath)
            await onRefreshInstalled()
        } catch (e) {
            setError(String(e))
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUninstall(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.uninstallMod(modId, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.enableMod(modId, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.disableMod(modId, gamePath)
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
            {fileSelect && (
                <FileSelectModal
                    mod={fileSelect.mod}
                    files={fileSelect.files}
                    gamePath={gamePath}
                    installedMod={installed.find((m) => m.id === fileSelect.mod.id)}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setFileSelect(null)}
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
                        if (permanent) await window.api.dismissDepsWarning(depsWarning.modId)
                        setDepsWarning(null)
                    }}
                />
            )}
            <div className="px-6 py-4 border-b border-border shrink-0 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg font-semibold">Browse Mods</h1>
                    {!gamePath && (
                        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded">
                            Game not found — install disabled
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search mods…"
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
                        placeholder="All categories"
                        options={[
                            { value: '', label: 'All categories' },
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
                {loadingMods ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        Loading…
                    </div>
                ) : !result || result.data.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        {result ? 'No mods found' : 'Loading…'}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                        {result.data.map((mod) => (
                            <ModCard
                                key={mod.id}
                                mod={mod}
                                installed={installed.find((m) => m.id === mod.id)}
                                gamePath={gamePath}
                                loading={loadingMod === mod.id}
                                progress={loadingMod === mod.id ? downloadProgress : null}
                                onOpen={() => onOpenDetail(mod.id)}
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
                        {result.meta.total > 0 && `${result.meta.total} mods`}
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
