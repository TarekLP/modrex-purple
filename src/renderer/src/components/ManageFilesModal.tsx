import { useState } from 'react'
import { X, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { InstalledMod, ModFolder } from '../../../shared/types'
import { Toggle } from './Toggle'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import { useInstalledContext } from './InstalledContext'

interface Props {
    mods: InstalledMod[]
    modName: string
    onClose: () => void
}

function getFolderPath(folders: ModFolder[], folderId: string | null): string | null {
    if (!folderId) return null
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return null
    const parent = getFolderPath(folders, folder.parentId)
    return parent ? `${parent}/${folder.diskName}` : folder.diskName
}

export function ManageFilesModal({ mods, modName, onClose }: Props) {
    const { handleEnable, handleDisable, handleUninstall, loadingMod, folders, installed } =
        useInstalledContext()
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

    const rawById = new Map(installed.map((m) => [m.uid, m]))

    function toggleCollapse(folderId: string) {
        setCollapsed((prev) => {
            const next = new Set(prev)
            if (next.has(folderId)) next.delete(folderId)
            else next.add(folderId)
            return next
        })
    }

    async function handleToggleMod(mod: InstalledMod) {
        if (loadingMod) return
        if (mod.enabled) await handleDisable([mod])
        else await handleEnable([mod])
    }

    async function handleToggleGroup(groupMods: InstalledMod[]) {
        if (loadingMod) return
        const allEnabled = groupMods.every((m) => m.enabled)
        if (allEnabled) await handleDisable(groupMods)
        else await handleEnable(groupMods)
    }

    async function handleRemoveMod(mod: InstalledMod) {
        if (loadingMod) return
        await handleUninstall([mod])
        if (mods.length <= 1) onClose()
    }

    async function handleRemoveGroup(groupMods: InstalledMod[]) {
        if (loadingMod) return
        await handleUninstall(groupMods)
        if (mods.length <= groupMods.length) onClose()
    }

    const groupMap = new Map<string | null, InstalledMod[]>()
    for (const mod of mods) {
        const key = rawById.get(mod.uid)?.folderId ?? null
        const arr = groupMap.get(key) ?? []
        arr.push(mod)
        groupMap.set(key, arr)
    }
    for (const arr of groupMap.values()) {
        arr.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    }

    const rootMods = groupMap.get(null) ?? []
    const folderGroups = [...groupMap.entries()]
        .filter(([k]) => k !== null)
        .map(([k, ms]) => ({
            folderId: k!,
            folder: folders.find((f) => f.id === k),
            path: getFolderPath(folders, k),
            priority: folders.find((f) => f.id === k)?.priority ?? 0,
            mods: ms,
        }))
        .sort((a, b) => a.priority - b.priority)

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && onClose()}
            title={modName}
            className="w-[32rem] max-h-[70vh] text-text"
        >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">{modName}</h2>
                    <p className="text-xs text-text-muted mt-0.5">
                        {t('installed.fileCount', { count: mods.length })}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="text-text-subtle hover:text-text transition-colors shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-1">
                {rootMods.map((mod) => (
                    <FileRow
                        key={mod.uid}
                        mod={mod}
                        loadingMod={loadingMod}
                        onToggle={() => handleToggleMod(mod)}
                        onRemove={() => handleRemoveMod(mod)}
                    />
                ))}

                {folderGroups.map(({ folderId, folder, path, mods: groupMods }) => {
                    const isCollapsed = collapsed.has(folderId)
                    const allEnabled = groupMods.every((m) => m.enabled)
                    return (
                        <div key={folderId}>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                                <button
                                    onClick={() => toggleCollapse(folderId)}
                                    className="text-text-subtle hover:text-text transition-colors shrink-0"
                                >
                                    {isCollapsed ? (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    ) : (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    )}
                                </button>
                                <span className="text-sm font-medium truncate flex-1 min-w-0">
                                    {folder?.displayName ?? path ?? folderId}
                                </span>
                                <span className="text-xs text-text-muted shrink-0">
                                    {groupMods.length}
                                </span>
                                <div
                                    className="flex items-center gap-2 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Toggle
                                        checked={allEnabled}
                                        disabled={!!loadingMod}
                                        onChange={() => handleToggleGroup(groupMods)}
                                    />
                                    <button
                                        onClick={() => handleRemoveGroup(groupMods)}
                                        disabled={!!loadingMod}
                                        title={t('common.remove')}
                                        className="p-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {!isCollapsed && (
                                <div className="ml-4 flex flex-col gap-0.5">
                                    {groupMods.map((mod) => (
                                        <FileRow
                                            key={mod.uid}
                                            mod={mod}
                                            loadingMod={loadingMod}
                                            onToggle={() => handleToggleMod(mod)}
                                            onRemove={() => handleRemoveMod(mod)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="flex justify-end px-5 py-4 border-t border-border shrink-0">
                <button
                    onClick={onClose}
                    className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active transition-colors"
                >
                    {t('common.close')}
                </button>
            </div>
        </Dialog>
    )
}

function FileRow({
    mod,
    loadingMod,
    onToggle,
    onRemove,
}: {
    mod: InstalledMod
    loadingMod: string | null
    onToggle: () => void
    onRemove: () => void
}) {
    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
            <span
                className={`text-xs flex-1 min-w-0 truncate ${loadingMod === mod.uid ? 'text-text-muted' : 'text-text'}`}
                title={mod.filename}
            >
                {mod.filename}
            </span>
            <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={mod.enabled} disabled={!!loadingMod} onChange={onToggle} />
                <button
                    onClick={onRemove}
                    disabled={!!loadingMod}
                    title={t('common.remove')}
                    className="p-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}
