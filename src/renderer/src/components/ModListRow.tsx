import { Trash2 } from 'lucide-react'
import { Toggle } from './Toggle'
import type { Mod, InstalledMod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { t } from '../i18n'

interface Props {
    mod: Mod
    installed: InstalledMod
    gamePath: string | null
    loading: boolean
    isDragging?: boolean
    onOpen: () => void
    onUninstall: () => void
    onEnable: () => void
    onDisable: () => void
    onDragStart?: (e: React.DragEvent) => void
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
            className={`group flex items-stretch rounded-lg border bg-surface-raised border-border hover:border-border/60 overflow-hidden transition-opacity ${
                isDragging || loading ? 'opacity-40' : 'opacity-100'
            }`}
        >
            <div onClick={onOpen} className="shrink-0 w-28 bg-surface-hover cursor-pointer">
                {mod.thumbnail ? (
                    <img
                        src={`${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`}
                        alt=""
                        loading="lazy"
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
                {installed.missing && (
                    <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-2 py-0.5 rounded">
                        {t('common.fileMissing')}
                    </span>
                )}
                <Toggle
                    checked={installed.enabled}
                    onChange={(v) => (v ? onEnable() : onDisable())}
                    disabled={!canAct || !!installed.missing}
                />
                <button
                    disabled={!canAct}
                    onClick={onUninstall}
                    title={t('common.remove')}
                    className="p-2 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
