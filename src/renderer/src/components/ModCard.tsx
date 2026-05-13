import type { Mod, InstalledMod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'

interface Props {
    mod: Mod
    installed: InstalledMod | undefined
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
    onInstall,
    onUninstall,
    onEnable,
    onDisable,
    loading,
    gamePath,
}: Props) {
    const canAct = !!gamePath && !loading

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
            {mod.thumbnail ? (
                <img
                    src={`${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`}
                    alt={mod.name}
                    className="w-full h-36 object-cover"
                />
            ) : (
                <div className="w-full h-36 bg-zinc-800 flex items-center justify-center">
                    <span className="text-zinc-600 text-xs">No image</span>
                </div>
            )}
            <div className="p-3 flex flex-col gap-2 flex-1">
                <div>
                    <h3 className="text-sm font-semibold leading-snug line-clamp-2">{mod.name}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">{mod.user.name}</p>
                </div>
                <p className="text-xs text-zinc-500 line-clamp-2 flex-1">{mod.short_desc}</p>
                <div className="flex items-center justify-between mt-auto">
                    <span className="text-xs text-zinc-500">
                        {mod.downloads.toLocaleString()} dl
                    </span>
                    {!installed && (
                        <button
                            disabled={!canAct || !mod.has_download}
                            onClick={onInstall}
                            className="text-xs px-3 py-1 rounded bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                                    className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 transition-colors"
                                >
                                    Disable
                                </button>
                            ) : (
                                <button
                                    disabled={!canAct}
                                    onClick={onEnable}
                                    className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 transition-colors"
                                >
                                    Enable
                                </button>
                            )}
                            <button
                                disabled={!canAct}
                                onClick={onUninstall}
                                className="text-xs px-2 py-1 rounded bg-red-900 hover:bg-red-800 disabled:opacity-40 transition-colors"
                            >
                                Remove
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
