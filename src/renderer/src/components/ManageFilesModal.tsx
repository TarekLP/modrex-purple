import { useState } from 'react'
import { X, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react'
import type { InstalledMod, ModFolder } from '../../../shared/types'
import { Toggle } from './Toggle'
import { Dialog } from './Dialog'
import { Tooltip } from './Tooltip'
import { t } from '../i18n'
import { displayFilename } from '../hooks/installedUtils'
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
    const [query, setQuery] = useState('')

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
        const anyEnabled = groupMods.some((m) => m.enabled)
        if (anyEnabled) await handleDisable(groupMods)
        else await handleEnable(groupMods)
    }

    async function handleRemove(targets: InstalledMod[]) {
        if (loadingMod) return
        await handleUninstall(targets)
        if (mods.length <= targets.length) onClose()
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

    const q = query.trim().toLowerCase()
    const matchesQuery = (mod: InstalledMod) =>
        displayFilename(mod.filename).toLowerCase().includes(q) ||
        mod.filename.toLowerCase().includes(q)
    const visibleRootMods = q ? rootMods.filter(matchesQuery) : rootMods
    const visibleGroups = q
        ? folderGroups
              .map((g) => {
                  const folderName = g.folder?.displayName ?? g.path ?? ''
                  // A matching folder name keeps the whole group visible
                  return folderName.toLowerCase().includes(q)
                      ? g
                      : { ...g, mods: g.mods.filter(matchesQuery) }
              })
              .filter((g) => g.mods.length > 0)
        : folderGroups
    const visibleMods = [...visibleRootMods, ...visibleGroups.flatMap((g) => g.mods)]
    const anyVisibleEnabled = visibleMods.some((m) => m.enabled)

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && onClose()}
            title={modName}
            className="w-[32rem] max-h-[70vh] text-text"
            onOpenAutoFocus={(e) => e.preventDefault()}
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

            <div className="flex items-center gap-2 px-3 pt-3 shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle pointer-events-none" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('installed.manageFiles.searchPlaceholder')}
                        className={`w-full text-xs pl-8 py-1.5 rounded bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors ${query ? 'pr-7' : 'pr-3'}`}
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <Toggle
                    checked={anyVisibleEnabled}
                    disabled={!!loadingMod || visibleMods.length === 0}
                    onChange={() => handleToggleGroup(visibleMods)}
                    title={t(
                        anyVisibleEnabled
                            ? 'installed.manageFiles.disableAll'
                            : 'installed.manageFiles.enableAll'
                    )}
                />
            </div>

            <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-1">
                {q && visibleMods.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-text-subtle text-sm">
                        {t('installed.manageFiles.noMatches', { query: query.trim() })}
                    </div>
                )}
                {visibleRootMods.map((mod) => (
                    <FileRow
                        key={mod.uid}
                        mod={mod}
                        loadingMod={loadingMod}
                        onToggle={() => handleToggleMod(mod)}
                        onRemove={() => handleRemove([mod])}
                    />
                ))}

                {visibleGroups.map(({ folderId, folder, path, mods: groupMods }) => {
                    // While searching, collapsed folders stay open so matches are visible
                    const isCollapsed = !q && collapsed.has(folderId)
                    const anyEnabled = groupMods.some((m) => m.enabled)
                    const folderName = folder?.displayName ?? path ?? folderId
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
                                    {folderName}
                                </span>
                                <span className="text-xs text-text-muted shrink-0">
                                    {groupMods.length}
                                </span>
                                <div
                                    className="flex items-center gap-2 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Toggle
                                        checked={anyEnabled}
                                        disabled={!!loadingMod}
                                        onChange={() => handleToggleGroup(groupMods)}
                                    />
                                    <Tooltip content={t('common.remove')}>
                                        <button
                                            onClick={() => handleRemove(groupMods)}
                                            disabled={!!loadingMod}
                                            className="p-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </Tooltip>
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
                                            onRemove={() => handleRemove([mod])}
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
                    className="text-xs px-3 py-1 rounded border border-border bg-surface-hover hover:bg-surface-active transition-colors"
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
                {displayFilename(mod.filename)}
            </span>
            <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={mod.enabled} disabled={!!loadingMod} onChange={onToggle} />
                <Tooltip content={t('common.remove')}>
                    <button
                        onClick={onRemove}
                        disabled={!!loadingMod}
                        className="p-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </Tooltip>
            </div>
        </div>
    )
}
