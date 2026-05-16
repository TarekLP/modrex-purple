import { useState, useEffect, useRef } from 'react'
import { X, Download, ExternalLink } from 'lucide-react'
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
    installedMod: InstalledMod | undefined
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
}

export function FileSelectModal({
    mod,
    files,
    gamePath,
    installedMod,
    onRefreshInstalled,
    onClose,
}: Props) {
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

    async function handleInstall(file: ModFile) {
        if (!gamePath) return
        setInstallingId(file.id)
        setInstallError(null)
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
            onClose()
        } catch (e) {
            setInstallError(String(e))
            setInstallingId(null)
        }
    }

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
                        const isInstalled = installedMod?.fileId === file.id
                        const isInstalling = installingId === file.id
                        return (
                            <div
                                key={file.id}
                                className="flex items-center gap-4 px-4 py-3 rounded-lg bg-surface-hover border border-border"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">{file.name}</div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-text-subtle flex-wrap">
                                        <span className="px-1.5 py-0.5 rounded bg-surface-active uppercase tracking-wide text-[10px]">
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
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        disabled={!gamePath || !!installingId || isInstalled}
                                        onClick={() => handleInstall(file)}
                                        className={`text-xs px-3 py-1.5 rounded transition-colors disabled:cursor-not-allowed flex items-center gap-1.5 ${
                                            isInstalled
                                                ? 'bg-success/20 border border-success/40 text-success-text'
                                                : 'bg-accent hover:bg-accent-bright disabled:opacity-40'
                                        }`}
                                    >
                                        {!isInstalling && !isInstalled && (
                                            <Download className="w-3.5 h-3.5" />
                                        )}
                                        {isInstalling
                                            ? downloadProgress
                                                ? downloadProgress.total > 0
                                                    ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                    : t('common.downloading')
                                                : t('common.installing')
                                            : isInstalled
                                              ? t('common.installed')
                                              : t('common.install')}
                                    </button>
                                    <button
                                        onClick={() => window.api.openExternal(file.download_url)}
                                        title={t('fileSelect.downloadManually')}
                                        className="text-xs px-2 py-1.5 rounded bg-surface-active hover:bg-surface-light transition-colors flex items-center"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
