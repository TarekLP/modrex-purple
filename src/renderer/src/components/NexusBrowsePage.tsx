import { useState, useEffect, useRef } from 'react'
import { Search, Download, ThumbsUp, Clock, ExternalLink } from 'lucide-react'
import type { GameId } from '../../../shared/types'
import { GAMES } from '../../../shared/types'
import { SearchClearButton } from './ui/SearchClearButton'
import { SkeletonCard } from './SkeletonCard'
import { Select } from './Select'
import { Button } from './ui/Button'
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

function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
}

function formatRelativeTime(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(ms / 60_000)
    if (mins < 60) return `${Math.max(1, mins)}m ago`
    const hours = Math.floor(ms / 3_600_000)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(ms / 86_400_000)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(days / 365)}y ago`
}

function NexusModCard({ mod, domain }: { mod: NexusModNode; domain: string }) {
    const [thumbLoaded, setThumbLoaded] = useState(false)

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
                        className={`w-full h-36 object-cover transition-opacity ${thumbLoaded ? '' : 'opacity-0'}`}
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
                <Button variant="accent" size="sm" onClick={openOnNexus}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('nexus.download')}
                </Button>
            </div>
        </div>
    )
}

export function NexusBrowsePage({ activeGame, isActive, onGoToSettings }: Props) {
    const domain = GAMES[activeGame].nexusDomain
    const [page, setPage] = useState(1)
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState(() => getSavedSort(activeGame))
    const [result, setResult] = useState<NexusResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const fetchIdRef = useRef(0)
    const lastFetchedRef = useRef('')
    const scrollRef = useRef<HTMLDivElement>(null)

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
                            {result.nodes.map((mod) => (
                                <NexusModCard key={mod.modId} mod={mod} domain={domain} />
                            ))}
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
