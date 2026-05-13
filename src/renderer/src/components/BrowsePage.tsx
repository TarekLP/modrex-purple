import { useState, useEffect, useCallback, useRef } from 'react'
import type { Mod, Paginated, InstalledMod, Category } from '../../../shared/types'
import type { SortOption } from '../../../main/api'
import { ModCard } from './ModCard'

interface Props {
    gamePath: string | null
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'downloads', label: 'Most Downloaded' },
    { value: 'likes', label: 'Most Liked' },
    { value: 'published_at', label: 'Newest' },
    { value: 'name', label: 'Name' },
]

export function BrowsePage({ gamePath }: Props) {
    const [page, setPage] = useState(1)
    const [query, setQuery] = useState('')
    const [categoryId, setCategoryId] = useState<number | undefined>()
    const [sort, setSort] = useState<SortOption>('downloads')
    const [result, setResult] = useState<Paginated<Mod> | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [installed, setInstalled] = useState<InstalledMod[]>([])
    const [loadingMods, setLoadingMods] = useState(false)
    const [loadingMod, setLoadingMod] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    const refreshInstalled = useCallback(async () => {
        const state = await window.api.getInstalled()
        setInstalled(state.mods)
    }, [])

    useEffect(() => {
        window.api.listCategories().then((r) => setCategories(r.data))
        refreshInstalled()
    }, [refreshInstalled])

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
            await window.api.installMod(modId, gamePath)
            await refreshInstalled()
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
            await refreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.enableMod(modId, gamePath)
            await refreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.disableMod(modId, gamePath)
            await refreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    return (
        <div className="h-full flex flex-col">
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
                    <input
                        type="text"
                        placeholder="Search mods…"
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        className="flex-1 text-sm px-3 py-1.5 rounded bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors"
                    />
                    <select
                        value={categoryId ?? ''}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        className="text-sm px-3 py-1.5 rounded bg-surface-hover border border-border text-text focus:outline-none focus:border-accent transition-colors"
                    >
                        <option value="">All categories</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={sort}
                        onChange={(e) => handleSortChange(e.target.value)}
                        className="text-sm px-3 py-1.5 rounded bg-surface-hover border border-border text-text focus:outline-none focus:border-accent transition-colors"
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
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
                                onInstall={() => handleInstall(mod.id)}
                                onUninstall={() => handleUninstall(mod.id)}
                                onEnable={() => handleEnable(mod.id)}
                                onDisable={() => handleDisable(mod.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {result && (
                <div className="px-6 py-3 border-t border-border flex items-center justify-between shrink-0">
                    <span className="text-xs text-text-subtle">
                        Page {result.meta.current_page} of {result.meta.last_page}
                        {result.meta.total > 0 && ` · ${result.meta.total} mods`}
                    </span>
                    <div className="flex gap-2">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Previous
                        </button>
                        <button
                            disabled={page >= result.meta.last_page}
                            onClick={() => setPage((p) => p + 1)}
                            className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
