import { memo, useEffect, useState } from 'react'
import { RefreshCw, ExternalLink } from 'lucide-react'
import { api } from '../api'
import { t } from '../i18n'
import { GAMES } from '../../../shared/types'
import type { GameId, NewsItem } from '../../../shared/types'
import { SkeletonCard } from './SkeletonCard'

const newsCache = new Map<GameId, NewsItem[]>()

interface Props {
    isActive: boolean
    activeGame: GameId
}

function NewsCard({ item }: { item: NewsItem }) {
    const [imgFailed, setImgFailed] = useState(false)

    return (
        <div className="h-full bg-surface-raised border border-border rounded-lg overflow-hidden flex flex-col transition-colors hover:border-accent/25">
            {item.image && !imgFailed ? (
                <img
                    src={item.image}
                    alt={item.title}
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                    className="w-full h-36 object-cover"
                />
            ) : (
                <div className="w-full h-36 bg-surface-hover flex items-center justify-center">
                    <span className="text-text-subtle text-xs">{t('common.noImage')}</span>
                </div>
            )}
            <div className="px-3 pt-3 pb-1 flex flex-col gap-1 flex-1">
                <span className="text-xs text-text-subtle">{item.date}</span>
                <h3 className="text-sm font-semibold leading-snug line-clamp-2">{item.title}</h3>
                <p className="text-xs text-text-subtle line-clamp-3">{item.excerpt}</p>
            </div>
            <div className="px-3 pb-3 pt-2 flex items-center justify-between mt-auto">
                <button
                    onClick={() => api.openExternal(item.url)}
                    className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright transition-colors flex items-center gap-1.5"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('news.readArticle')}
                </button>
                <span className="text-xs text-text-subtle">{t('news.source')}</span>
            </div>
        </div>
    )
}

function NewsPageImpl({ isActive, activeGame }: Props) {
    const [items, setItems] = useState<NewsItem[] | null>(() => newsCache.get(activeGame) ?? null)
    const [loading, setLoading] = useState(items === null)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!isActive) return
        const cached = newsCache.get(activeGame)
        if (cached) {
            setItems(cached)
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(false)
        api.fetchNews(activeGame)
            .then((result) => {
                if (cancelled) return
                newsCache.set(activeGame, result)
                setItems(result)
            })
            .catch(() => {
                if (!cancelled) setError(true)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [isActive, activeGame])

    async function handleRefresh() {
        setRefreshing(true)
        setError(false)
        try {
            const result = await api.refreshNews(activeGame)
            newsCache.set(activeGame, result)
            setItems(result)
        } catch {
            setError(true)
        } finally {
            setRefreshing(false)
        }
    }

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <p className="text-xs text-text-subtle uppercase tracking-wide">
                        {GAMES[activeGame].name}
                    </p>
                    <h1 className="text-2xl font-semibold">{t('news.title')}</h1>
                    <p className="text-sm text-text-muted mt-1">{t('news.subtitle')}</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing || loading}
                    className="px-3 py-1.5 rounded bg-surface-active hover:bg-surface-hover disabled:opacity-40 transition-colors text-sm flex items-center gap-2 shrink-0"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? t('news.refreshing') : t('news.refresh')}
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }, (_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ) : error && (!items || items.length === 0) ? (
                <p className="text-sm text-text-subtle">{t('news.loadFailed')}</p>
            ) : !items || items.length === 0 ? (
                <p className="text-sm text-text-subtle">{t('news.empty')}</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {items.map((item) => (
                        <NewsCard key={item.url} item={item} />
                    ))}
                </div>
            )}
        </div>
    )
}

export const NewsPage = memo(NewsPageImpl)
