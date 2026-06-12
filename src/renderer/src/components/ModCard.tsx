import { useState } from 'react'
import { Download, Heart, Eye, Clock, Trash2, RotateCcw } from 'lucide-react'
import { Toggle } from './Toggle'
import type { Mod, InstalledMod } from '../../../shared/types'
import { t } from '../i18n'
import { Tooltip } from './Tooltip'
import { useThumbnail } from '../hooks/useThumbnail'

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

interface Props {
    mod: Mod
    installed: InstalledMod | undefined
    installedCount?: number
    onOpen: () => void
    onInstall: () => void
    onUninstall: () => void
    onEnable: () => void
    onDisable: () => void
    onReinstall?: () => void
    onPrefetch?: () => void
    loading: boolean
    gamePath: string | null
    progress?: { downloaded: number; total: number } | null
    showMeta?: boolean
}

export function ModCard({
    mod,
    installed,
    installedCount,
    onOpen,
    onInstall,
    onUninstall,
    onEnable,
    onDisable,
    onReinstall,
    onPrefetch,
    loading,
    gamePath,
    progress = null,
    showMeta = false,
}: Props) {
    const thumbSrc = useThumbnail(mod.thumbnail?.file)
    // Fade the image in on its first real decode; cache hits (el.complete is
    // already true at mount) skip the fade so warm grids stay instant.
    const [thumbLoaded, setThumbLoaded] = useState(false)
    const canAct = !!gamePath && !loading

    const progressPct =
        loading && progress && progress.total > 0
            ? Math.round((progress.downloaded / progress.total) * 100)
            : null

    return (
        <div
            className="h-full bg-surface-raised border border-border rounded-lg overflow-hidden flex flex-col transition-colors hover:border-accent/25"
            onMouseEnter={onPrefetch}
        >
            <div className="cursor-pointer group relative" onClick={onOpen}>
                {thumbSrc ? (
                    <img
                        src={thumbSrc}
                        alt={mod.name}
                        loading="lazy"
                        ref={(el) => {
                            if (el?.complete) setThumbLoaded(true)
                        }}
                        onLoad={() => setThumbLoaded(true)}
                        className={`w-full h-36 object-cover transition-opacity ${thumbLoaded ? '' : 'opacity-0'}${installed && !installed.enabled ? ' grayscale' : ''}`}
                    />
                ) : (
                    <div className="w-full h-36 bg-surface-hover flex items-center justify-center">
                        <span className="text-text-subtle text-xs">{t('common.noImage')}</span>
                    </div>
                )}
                {installedCount !== undefined && installedCount > 1 && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-surface-raised/80 border border-border text-[10px] text-text-subtle pointer-events-none">
                        {t('installed.fileCount', { count: installedCount })}
                    </div>
                )}
                <div className="px-3 pt-3 pb-1 flex flex-col gap-1">
                    <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-accent-bright transition-colors">
                        {mod.name}
                    </h3>
                    <p className="text-xs text-text-muted">{mod.user.name}</p>
                    <p className="text-xs text-text-subtle line-clamp-2">{mod.short_desc}</p>
                </div>
            </div>

            <div className="px-3 pb-3 pt-2 flex items-center justify-between mt-auto">
                <div className="flex items-center">
                    {installed && !showMeta ? (
                        <span className="text-xs text-text-subtle">{installed.version}</span>
                    ) : (
                        <div className="flex items-center gap-3 text-xs text-text-subtle">
                            <span className="flex items-center gap-1">
                                <Heart className="w-3 h-3" />
                                {formatCount(mod.likes)}
                            </span>
                            <span className="flex items-center gap-1">
                                <Download className="w-3 h-3" />
                                {formatCount(mod.downloads)}
                            </span>
                            <span className="flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {formatCount(mod.views)}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatRelativeTime(mod.bumped_at)}
                            </span>
                        </div>
                    )}
                </div>
                {!installed && (
                    <button
                        disabled={!canAct || !mod.has_download || !!mod.disable_mod_managers}
                        title={
                            mod.disable_mod_managers ? t('common.modManagerDisabled') : undefined
                        }
                        onClick={onInstall}
                        className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                    >
                        {!loading && <Download className="w-3.5 h-3.5" />}
                        {loading
                            ? progressPct !== null
                                ? `${progressPct}%`
                                : progress
                                  ? t('common.downloading')
                                  : t('common.installing')
                            : t('common.install')}
                    </button>
                )}
                {installed && (
                    <div className="flex items-center gap-2">
                        {installed.missing && (
                            <>
                                <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-2 py-0.5 rounded">
                                    {t('common.fileMissing')}
                                </span>
                                {installed.id >= 0 && (
                                    <Tooltip content={t('common.reinstall')}>
                                        <button
                                            disabled={!canAct}
                                            onClick={onReinstall}
                                            className="p-1.5 rounded bg-warning/20 hover:bg-warning/30 border border-warning/30 text-warning disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                    </Tooltip>
                                )}
                            </>
                        )}
                        {installed.archiveBroken && (
                            <>
                                <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-2 py-0.5 rounded">
                                    {t('common.zipArchiveBroken')}
                                </span>
                                <button
                                    disabled={!canAct}
                                    onClick={onReinstall}
                                    className="text-xs px-2 py-0.5 rounded bg-warning/20 hover:bg-warning/30 border border-warning/30 text-warning disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    {t('common.fix')}
                                </button>
                            </>
                        )}
                        <Toggle
                            checked={installed.enabled}
                            onChange={(v) => (v ? onEnable() : onDisable())}
                            disabled={!canAct || !!installed.missing}
                        />
                        <Tooltip content={t('common.remove')}>
                            <button
                                disabled={!canAct}
                                onClick={onUninstall}
                                className="p-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </Tooltip>
                    </div>
                )}
            </div>

            {loading && progress !== null && (
                <div className="h-0.5 bg-surface-active">
                    {progress.total > 0 ? (
                        <div
                            className="h-full bg-accent transition-[width] duration-100"
                            style={{ width: `${progressPct}%` }}
                        />
                    ) : (
                        <div className="h-full bg-accent animate-pulse w-full" />
                    )}
                </div>
            )}
        </div>
    )
}
