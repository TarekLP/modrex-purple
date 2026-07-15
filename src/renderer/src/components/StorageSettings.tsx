import { useState, useEffect, useCallback } from 'react'
import { Loader, Trash2, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from './ui/Button'
import { Dialog } from './Dialog'
import { api } from '../api'
import { t } from '../i18n'
import { formatBytes } from './modDetail/format'
import { clearModCache, getModCacheSize } from '../modCache'
import { clearResolvedThumbnails } from '../thumbnailCache'

type CacheId = 'thumbnails' | 'modInfo' | 'indexDb' | 'news'

interface Usage {
    thumbnails: number
    modInfo: number
    indexDb: number
    news: number
}

interface ConfirmSpec {
    title: string
    body: string
    actionLabel: string
    busyLabel: string
    run: () => Promise<void>
}

const ROWS: { id: CacheId; label: string; description: string; action: string }[] = [
    {
        id: 'thumbnails',
        label: t('settings.storage.cachedImages'),
        description: t('settings.storage.cachedImagesDescription'),
        action: t('settings.storage.clearImages'),
    },
    {
        id: 'modInfo',
        label: t('settings.storage.cachedModInfo'),
        description: t('settings.storage.cachedModInfoDescription'),
        action: t('settings.storage.clearModInfo'),
    },
    {
        id: 'indexDb',
        label: t('settings.storage.modIndex'),
        description: t('settings.storage.modIndexDescription'),
        action: t('settings.storage.clearDatabase'),
    },
    {
        id: 'news',
        label: t('settings.storage.news'),
        description: t('settings.storage.newsDescription'),
        action: t('settings.storage.clearNews'),
    },
]

// Returns the bytes freed. Thumbnails also drop the renderer's in-memory URL map;
// mod info is a pure localStorage clear, the rest are on-disk deletions in Rust.
async function clearCache(id: CacheId): Promise<number> {
    if (id === 'thumbnails') {
        const bytes = await api.clearThumbnailCache()
        clearResolvedThumbnails()
        return bytes
    }
    if (id === 'modInfo') return clearModCache()
    if (id === 'indexDb') return api.clearIndexCache()
    return api.clearNewsCache()
}

export function StorageSettings() {
    const [usage, setUsage] = useState<Usage | null>(null)
    const [freed, setFreed] = useState<{ id: CacheId | 'all'; bytes: number } | null>(null)
    const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
    const [confirmBusy, setConfirmBusy] = useState(false)

    const refreshUsage = useCallback(async () => {
        const disk = await api.getStorageUsage()
        setUsage({
            thumbnails: disk.thumbnails,
            indexDb: disk.indexDb,
            news: disk.news,
            modInfo: getModCacheSize(),
        })
    }, [])

    useEffect(() => {
        refreshUsage()
    }, [refreshUsage])

    const clearOne = useCallback(
        async (id: CacheId) => {
            const bytes = await clearCache(id)
            setFreed({ id, bytes })
            await refreshUsage()
        },
        [refreshUsage]
    )

    const clearAll = useCallback(async () => {
        const [thumbs, index, news] = await Promise.all([
            api.clearThumbnailCache(),
            api.clearIndexCache(),
            api.clearNewsCache(),
        ])
        const modInfo = clearModCache()
        clearResolvedThumbnails()
        setFreed({ id: 'all', bytes: thumbs + index + news + modInfo })
        await refreshUsage()
    }, [refreshUsage])

    const handleReset = useCallback(async () => {
        await api.resetAppSettings()
        // Also drop every renderer-side preference and cache so a reset lands on a
        // genuine first-run state, then reload to re-read the defaults.
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('modrex:')) localStorage.removeItem(key)
        }
        window.location.reload()
    }, [])

    async function runConfirm() {
        if (!confirm) return
        setConfirmBusy(true)
        try {
            await confirm.run()
        } finally {
            setConfirmBusy(false)
            setConfirm(null)
        }
    }

    function confirmClear(id: CacheId, label: string, action: string) {
        setFreed(null)
        setConfirm({
            title: t('settings.storage.clearConfirmTitle', { name: label }),
            body: t('settings.storage.clearConfirmBody'),
            actionLabel: action,
            busyLabel: t('settings.storage.clearing'),
            run: () => clearOne(id),
        })
    }

    function confirmClearAll() {
        setFreed(null)
        setConfirm({
            title: t('settings.storage.clearAllConfirmTitle'),
            body: t('settings.storage.clearAllConfirmBody'),
            actionLabel: t('settings.storage.clearAll'),
            busyLabel: t('settings.storage.clearing'),
            run: clearAll,
        })
    }

    function confirmReset() {
        setConfirm({
            title: t('settings.storage.resetConfirmTitle'),
            body: t('settings.storage.resetConfirmBody'),
            actionLabel: t('settings.storage.resetConfirm'),
            busyLabel: t('settings.storage.resetting'),
            run: handleReset,
        })
    }

    const total = usage ? usage.thumbnails + usage.modInfo + usage.indexDb + usage.news : 0

    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t('settings.storage.title')}</h2>

            <div className="rounded-lg border border-danger/30 bg-danger/5 mt-1">
                <div className="flex items-center gap-2 border-b border-danger/20 px-4 py-3">
                    <TriangleAlert className="w-4 h-4 text-danger-text shrink-0" />
                    <span className="text-sm font-semibold text-danger-text">
                        {t('settings.storage.dangerZone')}
                    </span>
                </div>
                <p className="px-4 pt-3 text-xs text-text-muted">
                    {t('settings.storage.dangerZoneDescription')}
                </p>

                <div className="flex flex-col divide-y divide-danger/10 px-4 py-1">
                    {ROWS.map(({ id, label, description, action }) => (
                        <div key={id} className="flex items-center gap-4 py-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-text">{label}</div>
                                <div className="text-xs text-text-subtle">{description}</div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                {freed?.id === id ? (
                                    <span className="text-xs text-success-text">
                                        {t('settings.storage.freed', {
                                            size: formatBytes(freed.bytes),
                                        })}
                                    </span>
                                ) : (
                                    <span className="text-xs text-text-muted tabular-nums">
                                        {usage ? formatBytes(usage[id]) : '…'}
                                    </span>
                                )}
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => confirmClear(id, label, action)}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {action}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-4 border-t border-danger/20 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-sm text-text">
                            {t('settings.storage.clearAllLabel')}
                        </div>
                        <div className="text-xs text-text-subtle">
                            {t('settings.storage.clearAllDescription')}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {freed?.id === 'all' ? (
                            <span className="text-xs text-success-text">
                                {t('settings.storage.freed', {
                                    size: formatBytes(freed.bytes),
                                })}
                            </span>
                        ) : (
                            <span className="text-xs text-text-muted tabular-nums">
                                {usage ? formatBytes(total) : '…'}
                            </span>
                        )}
                        <Button variant="danger" size="sm" onClick={confirmClearAll}>
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('settings.storage.clearAll')}
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-4 border-t border-danger/20 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-sm text-text">{t('settings.storage.reset')}</div>
                        <div className="text-xs text-text-subtle">
                            {t('settings.storage.resetDescription')}
                        </div>
                    </div>
                    <Button variant="danger" size="sm" className="shrink-0" onClick={confirmReset}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('settings.storage.reset')}
                    </Button>
                </div>
            </div>

            <Dialog
                open={confirm !== null}
                onOpenChange={(o) => {
                    if (!o && !confirmBusy) setConfirm(null)
                }}
                title={confirm?.title ?? ''}
                className="w-[440px]"
            >
                {confirm && (
                    <div className="p-6 flex flex-col gap-4">
                        <h2 className="text-sm font-semibold">{confirm.title}</h2>
                        <p className="text-xs text-text-muted">{confirm.body}</p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="md"
                                disabled={confirmBusy}
                                onClick={() => setConfirm(null)}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="danger"
                                size="md"
                                disabled={confirmBusy}
                                onClick={runConfirm}
                            >
                                {confirmBusy ? (
                                    <Loader className="w-3.5 h-3.5 animate-spin" />
                                ) : null}
                                {confirmBusy ? confirm.busyLabel : confirm.actionLabel}
                            </Button>
                        </div>
                    </div>
                )}
            </Dialog>
        </section>
    )
}
