import { useState, useEffect, useRef } from 'react'
import { X, Tag, Download, Clock } from 'lucide-react'
import type { Mod, ModFile, InstalledMod } from '../../../shared/types'
import { t } from '../i18n'
import { MarkdownContent } from './MarkdownContent'
import { api } from '../api'

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${parseFloat((bytes / 1024 / 1024).toFixed(1))} MB`
}

interface Props {
    mod: Mod
    files: ModFile[]
    gamePath: string | null
    installedFiles: InstalledMod[]
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
}

export function FileSelectModal({
    mod,
    files,
    gamePath,
    installedFiles,
    onRefreshInstalled,
    onClose,
}: Props) {
    const uninstalledIds = files
        .filter((f) => !installedFiles.some((m) => m.fileId === f.id))
        .map((f) => f.id)

    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(uninstalledIds))
    const [installingId, setInstallingId] = useState<number | null>(null)
    const [installError, setInstallError] = useState<string | null>(null)
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

    function toggleFile(fileId: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            next.has(fileId) ? next.delete(fileId) : next.add(fileId)
            return next
        })
    }

    async function handleInstallSelected() {
        if (!gamePath) return
        setInstallError(null)
        const toInstall = files.filter(
            (f) => selectedIds.has(f.id) && !installedFiles.some((m) => m.fileId === f.id)
        )
        for (const file of toInstall) {
            setInstallingId(file.id)
            try {
                await api.installModFile(
                    mod.id,
                    mod.name,
                    file.id,
                    file.download_url,
                    file.type,
                    mod.version,
                    gamePath
                )
                await onRefreshInstalled()
                setSelectedIds((prev) => {
                    const next = new Set(prev)
                    next.delete(file.id)
                    return next
                })
            } catch (e) {
                setInstallError(String(e))
                setInstallingId(null)
                return
            }
        }
        setInstallingId(null)
        onClose()
    }

    const pendingCount = [...selectedIds].filter(
        (id) => !installedFiles.some((m) => m.fileId === id)
    ).length
    const isBusy = installingId !== null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
        >
            <div
                className="bg-surface-raised border border-border rounded-lg shadow-xl w-[540px] max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{t('fileSelect.title')}</h2>
                        <p className="text-xs text-text-muted mt-0.5 truncate">
                            {t('fileSelect.subtitle', { modName: mod.name })}
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
                    {installError && (
                        <div className="px-4 py-3 rounded-lg bg-danger/30 border border-danger-hover text-sm text-danger-text">
                            {installError}
                        </div>
                    )}
                    {files.map((file) => {
                        const isInstalled = installedFiles.some((m) => m.fileId === file.id)
                        const isInstalling = installingId === file.id
                        const isSelected = selectedIds.has(file.id)
                        return (
                            <div
                                key={file.id}
                                onClick={() => !isInstalled && !isBusy && toggleFile(file.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                                    isInstalled
                                        ? 'bg-surface-hover border-border opacity-60'
                                        : isSelected
                                          ? 'bg-accent/5 border-accent/40 cursor-pointer'
                                          : 'bg-surface-hover border-border cursor-pointer'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isInstalled || isSelected}
                                    disabled={isInstalled || isBusy}
                                    onChange={() => toggleFile(file.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="accent-accent w-4 h-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        {file.label && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-medium uppercase tracking-wide shrink-0">
                                                {file.label}
                                            </span>
                                        )}
                                        <span className="text-sm font-semibold truncate">
                                            {file.name}
                                        </span>
                                        {isInstalling ? (
                                            <span className="text-xs text-text-muted shrink-0">
                                                {downloadProgress
                                                    ? downloadProgress.total > 0
                                                        ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                        : t('common.downloading')
                                                    : t('common.installing')}
                                            </span>
                                        ) : isInstalled ? (
                                            <span className="text-xs text-success-text shrink-0">
                                                {t('common.installed')}
                                            </span>
                                        ) : null}
                                    </div>
                                    {file.desc && (
                                        <div className="text-xs text-text-muted mt-1 [&_a]:text-accent-bright [&_a]:hover:underline">
                                            <MarkdownContent text={file.desc} />
                                        </div>
                                    )}
                                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-text-subtle">
                                        <span className="uppercase">{file.type}</span>
                                        <span>{formatBytes(file.size)}</span>
                                        {file.version && (
                                            <span className="flex items-center gap-1">
                                                <Tag className="w-3 h-3 shrink-0" />
                                                {file.version}
                                            </span>
                                        )}
                                        {file.downloads != null && (
                                            <span className="flex items-center gap-1">
                                                <Download className="w-3 h-3 shrink-0" />
                                                {file.downloads.toLocaleString()}
                                            </span>
                                        )}
                                        {file.created_at && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3 shrink-0" />
                                                {new Date(file.created_at).toLocaleDateString(
                                                    undefined,
                                                    {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric',
                                                    }
                                                )}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isBusy}
                        className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 transition-colors"
                    >
                        {t('common.close')}
                    </button>
                    <button
                        disabled={!gamePath || isBusy || pendingCount === 0}
                        onClick={handleInstallSelected}
                        className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {t('fileSelect.installSelected', { count: pendingCount })}
                    </button>
                </div>
            </div>
        </div>
    )
}
