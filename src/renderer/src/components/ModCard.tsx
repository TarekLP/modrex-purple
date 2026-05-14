import type { Mod, InstalledMod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
}

interface Props {
    mod: Mod
    installed: InstalledMod | undefined
    onOpen: () => void
    onInstall: () => void
    onUninstall: () => void
    onEnable: () => void
    onDisable: () => void
    loading: boolean
    gamePath: string | null
}

export function ModCard({
    mod,
    installed,
    onOpen,
    onInstall,
    onUninstall,
    onEnable,
    onDisable,
    loading,
    gamePath,
}: Props) {
    const canAct = !!gamePath && !loading

    return (
        <div className="bg-surface-raised border border-border rounded-lg overflow-hidden flex flex-col">
            {/* Clickable area — opens detail modal */}
            <div className="cursor-pointer group" onClick={onOpen}>
                {mod.thumbnail ? (
                    <img
                        src={`${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`}
                        alt={mod.name}
                        className={`w-full h-36 object-cover transition-[filter] ${installed && !installed.enabled ? 'grayscale group-hover:grayscale-0' : 'group-hover:brightness-110'}`}
                    />
                ) : (
                    <div className="w-full h-36 bg-surface-hover flex items-center justify-center">
                        <span className="text-text-subtle text-xs">No image</span>
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

            {/* Action row — not part of the clickable area */}
            <div className="px-3 pb-3 pt-2 flex items-center justify-between mt-auto">
                <div className="flex flex-col">
                    {installed ? (
                        <span className="text-xs text-text-subtle">v{installed.version}</span>
                    ) : (
                        <>
                            <span className="text-xs text-text-subtle">
                                {mod.downloads.toLocaleString()} dl
                            </span>
                            <span className="text-xs text-text-subtle">
                                {timeAgo(mod.bumped_at)}
                            </span>
                        </>
                    )}
                </div>
                {!installed && (
                    <button
                        disabled={!canAct || !mod.has_download}
                        onClick={onInstall}
                        className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? 'Installing…' : 'Install'}
                    </button>
                )}
                {installed && (
                    <div className="flex gap-1">
                        {installed.enabled ? (
                            <button
                                disabled={!canAct}
                                onClick={onDisable}
                                className="text-xs px-2 py-1 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 transition-colors"
                            >
                                Disable
                            </button>
                        ) : (
                            <button
                                disabled={!canAct}
                                onClick={onEnable}
                                className="text-xs px-2 py-1 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 transition-colors"
                            >
                                Enable
                            </button>
                        )}
                        <button
                            disabled={!canAct}
                            onClick={onUninstall}
                            className="text-xs px-2 py-1 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 transition-colors"
                        >
                            Remove
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
