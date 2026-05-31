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
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
}

export function ZipPickerModal({
    payload,
    gamePath,
    folderId,
    onRefreshInstalled,
    onClose,
}: Props) {
    const [selected, setSelected] = useState<string | null>(
        payload.entries.length === 1 ? payload.entries[0] : null
    )
    const [installing, setInstalling] = useState(false)
    const [error, setError] = useState<string | null>(null)
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

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    async function handleInstall() {
        if (!selected) return
        setInstalling(true)
        setError(null)
        try {
            await api.installFromZipEntry(
                payload.zipPath,
                selected,
                payload.modId,
                payload.modName,
                payload.fileId,
                payload.fileType,
                payload.modVersion,
                gamePath,
                folderId
            )
            await onRefreshInstalled()
            onClose()
        } catch (e) {
            setError(String(e))
        } finally {
            setInstalling(false)
        }
    }

    function displayName(entry: string) {
        return entry.split('/').pop() ?? entry
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
        >
            <div
                className="bg-surface-raised border border-border rounded-lg shadow-xl w-[480px] max-h-[70vh] flex flex-col"
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
                        onClick={onClose}
                        className="text-text-subtle hover:text-text transition-colors shrink-0 mt-0.5"
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
                    {payload.entries.map((entry) => (
                        <button
                            key={entry}
                            onClick={() => !installing && setSelected(entry)}
                            disabled={installing}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors w-full ${
                                selected === entry
                                    ? 'bg-accent/5 border-accent/40'
                                    : 'bg-surface-hover border-border hover:bg-surface-active'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <input
                                type="radio"
                                checked={selected === entry}
                                onChange={() => setSelected(entry)}
                                disabled={installing}
                                onClick={(e) => e.stopPropagation()}
                                className="accent-accent w-4 h-4 shrink-0"
                            />
                            <span className="text-sm font-medium truncate">
                                {displayName(entry)}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                    <button
                        onClick={onClose}
                        disabled={installing}
                        className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        disabled={!selected || installing}
                        onClick={handleInstall}
                        className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {installing
                            ? downloadProgress && downloadProgress.total > 0
                                ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                : t('common.installing')
                            : t('zipPicker.install')}
                    </button>
                </div>
            </div>
        </div>
    )
}
