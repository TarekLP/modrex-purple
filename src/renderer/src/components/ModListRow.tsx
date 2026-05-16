import { Trash2 } from 'lucide-react'
import { Toggle } from './Toggle'
import type { Mod, InstalledMod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'

interface Props {
    mod: Mod
    installed: InstalledMod
    gamePath: string | null
    loading: boolean
    isDragging?: boolean
    isDragOver?: boolean
    onOpen: () => void
    onUninstall: () => void
    onEnable: () => void
    onDisable: () => void
    onDragStart?: () => void
    onDragOver?: (e: React.DragEvent) => void
    onDrop?: () => void
    onDragEnd?: () => void
}

export function ModListRow({
    mod,
    installed,
    gamePath,
    loading,
    isDragging,
    isDragOver,
    onOpen,
    onUninstall,
    onEnable,
    onDisable,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: Props) {
    const canAct = !!gamePath && !loading

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            className={`group flex items-stretch rounded-lg border overflow-hidden transition-all ${
                isDragging
                    ? 'opacity-40 border-border'
                    : isDragOver
                      ? 'border-accent bg-accent/5'
                      : 'bg-surface-raised border-border hover:border-border/60'
            } ${loading ? 'opacity-60' : ''}`}
        >
            <div onClick={onOpen} className="shrink-0 w-28 bg-surface-hover cursor-pointer">
                {mod.thumbnail ? (
                    <img
                        src={`${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`}
                        alt=""
                        className={`w-full h-full object-cover transition-[filter] ${!installed.enabled ? 'grayscale group-hover:grayscale-0' : 'group-hover:brightness-110'}`}
                    />
                ) : (
                    <div className="w-full h-full" />
                )}
            </div>

            <button onClick={onOpen} className="flex-1 min-w-0 text-left px-5 py-4">
                <p className="text-sm font-bold leading-snug truncate group-hover:text-accent-bright transition-colors">
                    {mod.name}
                </p>
                <p className="text-xs text-text-muted mt-0.5 truncate">By {mod.user.name}</p>
                <p className="text-xs text-text-subtle mt-1 tabular-nums">{installed.version}</p>
            </button>

            <div className="flex items-center gap-2 px-4 shrink-0">
                <Toggle
                    checked={installed.enabled}
                    onChange={(v) => (v ? onEnable() : onDisable())}
                    disabled={!canAct}
                />
                <button
                    disabled={!canAct}
                    onClick={onUninstall}
                    title="Remove"
                    className="p-2 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
