import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'
import type { Mod, ModFile, InstalledMod } from '../../../shared/types'
import { t } from '../i18n'

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
        return window.api.onDownloadProgress(({ downloaded, total }) => {
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
                await window.api.installModFile(
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
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                                    isInstalled
                                        ? 'bg-surface-hover border-border opacity-60'
                                        : isSelected
                                          ? 'bg-accent/5 border-accent/40 cursor-pointer'
                                          : 'bg-surface-hover border-border cursor-pointer hover:border-border'
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
                                        <span className="text-sm font-medium truncate">
                                            {file.name}
                                        </span>
                                        {isInstalled && (
                                            <span className="text-xs text-success-text shrink-0">
                                                {isInstalling
                                                    ? downloadProgress
                                                        ? downloadProgress.total > 0
                                                            ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                            : t('common.downloading')
                                                        : t('common.installing')
                                                    : t('common.installed')}
                                            </span>
                                        )}
                                        {isInstalling && (
                                            <span className="text-xs text-text-muted shrink-0">
                                                {downloadProgress
                                                    ? downloadProgress.total > 0
                                                        ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                        : t('common.downloading')
                                                    : t('common.installing')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-text-subtle flex-wrap">
                                        <span className="px-1.5 py-0.5 rounded bg-surface-active text-text uppercase tracking-wide text-[10px]">
                                            {file.type}
                                        </span>
                                        <span>{formatBytes(file.size)}</span>
                                        {file.version && <span>v{file.version}</span>}
                                        {file.label && <span>{file.label}</span>}
                                        {file.downloads != null && (
                                            <span>{file.downloads.toLocaleString()} dl</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        window.api.openExternal(file.download_url)
                                    }}
                                    title={t('fileSelect.downloadManually')}
                                    className="p-1.5 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors shrink-0"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </button>
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
