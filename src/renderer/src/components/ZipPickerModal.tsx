import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { t } from '../i18n'
import { api } from '../api'

export interface ZipMultiPakPayload {
    zipPath: string
    entries: string[]
    modId: number
    modName: string
    fileId: number
    fileType: string
    modVersion: string
}

export function parseZipMultiPak(error: string): ZipMultiPakPayload | null {
    const PREFIX = 'ZIP_MULTI_PAK:'
    if (!error.startsWith(PREFIX)) return null
    try {
        return JSON.parse(error.slice(PREFIX.length)) as ZipMultiPakPayload
    } catch {
        return null
    }
}

interface Props {
    payload: ZipMultiPakPayload
    gamePath: string
    folderId?: string | null
    gameId?: string
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
}

export function ZipPickerModal({
    payload,
    gamePath,
    folderId,
    gameId,
    onRefreshInstalled,
    onClose,
}: Props) {
    const [selected, setSelected] = useState<Set<string>>(() => new Set(payload.entries))
    const [installingEntry, setInstallingEntry] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const progressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const isBusy = installingEntry !== null
    const pendingCount = selected.size

    useEffect(() => {
        return api.onDownloadProgress(({ downloaded, total }) => {
            setDownloadProgress({ downloaded, total })
            if (progressClearTimer.current) clearTimeout(progressClearTimer.current)
            progressClearTimer.current = setTimeout(() => setDownloadProgress(null), 800)
        })
    }, [])

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape' && !isBusy) onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose, isBusy])

    function toggle(entry: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(entry)) next.delete(entry)
            else next.add(entry)
            return next
        })
    }

    function toggleAll() {
        setSelected((prev) =>
            prev.size === payload.entries.length ? new Set() : new Set(payload.entries)
        )
    }

    async function handleInstall() {
        if (selected.size === 0) return
        setError(null)
        const toInstall = payload.entries.filter((e) => selected.has(e))
        for (const entry of toInstall) {
            setInstallingEntry(entry)
            try {
                await api.installFromZipEntry(
                    payload.zipPath,
                    entry,
                    payload.modId,
                    payload.modName,
                    payload.fileId,
                    payload.fileType,
                    payload.modVersion,
                    gamePath,
                    folderId,
                    gameId
                )
                await onRefreshInstalled()
            } catch (e) {
                setInstallingEntry(null)
                setError(String(e))
                return
            }
        }
        setInstallingEntry(null)
        await api.deleteTempFile(payload.zipPath)
        onClose()
    }

    function displayName(entry: string) {
        return entry.split('/').pop() ?? entry
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={!isBusy ? onClose : undefined}
        >
            <div
                className="bg-surface-raised border border-border rounded-lg shadow-xl w-[520px] max-h-[75vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{t('zipPicker.title')}</h2>
                        <p className="text-xs text-text-muted mt-0.5 truncate">
                            {t('zipPicker.subtitle', { modName: payload.modName })}
                        </p>
                    </div>
                    <button
                        onClick={!isBusy ? onClose : undefined}
                        disabled={isBusy}
                        className="text-text-subtle hover:text-text transition-colors shrink-0 mt-0.5 disabled:opacity-40"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {downloadProgress !== null && (
                    <div className="h-0.5 bg-surface-active shrink-0">
                        {downloadProgress.total > 0 ? (
                            <div
                                className="h-full bg-accent transition-[width] duration-100"
                                style={{
                                    width: `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`,
                                }}
                            />
                        ) : (
                            <div className="h-full bg-accent animate-pulse w-full" />
                        )}
                    </div>
                )}

                <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-2">
                    {error && (
                        <div className="px-4 py-3 rounded-lg bg-danger/30 border border-danger-hover text-sm text-danger-text">
                            {error}
                        </div>
                    )}
                    <div
                        onClick={() => !isBusy && toggleAll()}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover cursor-pointer hover:bg-surface-active transition-colors"
                    >
                        <input
                            type="checkbox"
                            checked={selected.size === payload.entries.length}
                            ref={(el) => {
                                if (el)
                                    el.indeterminate =
                                        selected.size > 0 && selected.size < payload.entries.length
                            }}
                            onChange={toggleAll}
                            disabled={isBusy}
                            onClick={(e) => e.stopPropagation()}
                            className="accent-accent w-4 h-4 shrink-0"
                        />
                        <span className="text-xs font-medium text-text-muted">
                            {selected.size === payload.entries.length
                                ? t('zipPicker.deselectAll')
                                : t('zipPicker.selectAll', { count: payload.entries.length })}
                        </span>
                    </div>
                    {payload.entries.map((entry) => {
                        const isInstalling = installingEntry === entry
                        return (
                            <div
                                key={entry}
                                onClick={() => !isBusy && toggle(entry)}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                                    selected.has(entry)
                                        ? 'bg-accent/5 border-accent/40'
                                        : 'bg-surface-hover border-border'
                                } ${isBusy ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-active'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(entry)}
                                    onChange={() => toggle(entry)}
                                    disabled={isBusy}
                                    onClick={(e) => e.stopPropagation()}
                                    className="accent-accent w-4 h-4 shrink-0"
                                />
                                <span className="text-sm font-medium truncate flex-1">
                                    {displayName(entry)}
                                </span>
                                {isInstalling && (
                                    <span className="text-xs text-text-muted shrink-0">
                                        {downloadProgress && downloadProgress.total > 0
                                            ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                            : t('common.installing')}
                                    </span>
                                )}
                            </div>
                        )
                    })}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                    <button
                        onClick={!isBusy ? onClose : undefined}
                        disabled={isBusy}
                        className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        disabled={pendingCount === 0 || isBusy}
                        onClick={handleInstall}
                        className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {isBusy
                            ? t('common.installing')
                            : t('zipPicker.installSelected', { count: pendingCount })}
                    </button>
                </div>
            </div>
        </div>
    )
}
