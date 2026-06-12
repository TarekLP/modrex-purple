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
    const { handleApplyEnabled, handleUninstall, loadingMod, folders, installed } =
        useInstalledContext()
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
    const [query, setQuery] = useState('')
    // Draft layer: pending enabled-state edits keyed by uid. Only deviations from
    // the on-disk state are stored, so a background refresh never wipes user edits.
    const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())

    const rawById = new Map(installed.map((m) => [m.uid, m]))

    const isEnabled = (mod: InstalledMod) => overrides.get(mod.uid) ?? mod.enabled

    function setEnabled(targets: InstalledMod[], value: boolean) {
        setOverrides((prev) => {
            const next = new Map(prev)
            for (const mod of targets) {
                if (value === mod.enabled) next.delete(mod.uid)
                else next.set(mod.uid, value)
            }
            return next
        })
    }

    function toggleCollapse(folderId: string) {
        setCollapsed((prev) => {
            const next = new Set(prev)
            if (next.has(folderId)) next.delete(folderId)
            else next.add(folderId)
            return next
        })
    }

    const pending = mods.filter((m) => overrides.has(m.uid) && overrides.get(m.uid) !== m.enabled)

    async function handleApply() {
        if (loadingMod || pending.length === 0) return
        const toEnable = pending.filter((m) => overrides.get(m.uid) === true)
        const toDisable = pending.filter((m) => overrides.get(m.uid) === false)
        await handleApplyEnabled(toEnable, toDisable)
        setOverrides(new Map())
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
    const visibleEnabledCount = visibleMods.filter(isEnabled).length
    const allVisibleEnabled = visibleMods.length > 0 && visibleEnabledCount === visibleMods.length

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
                <Tooltip
                    content={
                        allVisibleEnabled
                            ? t('installed.manageFiles.disableAll')
                            : t('installed.manageFiles.enableAll')
                    }
                >
                    <Toggle
                        checked={allVisibleEnabled}
                        indeterminate={visibleEnabledCount > 0 && !allVisibleEnabled}
                        disabled={!!loadingMod || visibleMods.length === 0}
                        onChange={() => setEnabled(visibleMods, !allVisibleEnabled)}
                    />
                </Tooltip>
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
                        enabled={isEnabled(mod)}
                        loadingMod={loadingMod}
                        onToggle={() => setEnabled([mod], !isEnabled(mod))}
                        onRemove={() => handleRemove([mod])}
                    />
                ))}

                {visibleGroups.map(({ folderId, folder, path, mods: groupMods }) => {
                    // While searching, collapsed folders stay open so matches are visible
                    const isCollapsed = !q && collapsed.has(folderId)
                    const enabledCount = groupMods.filter(isEnabled).length
                    const allEnabled = enabledCount === groupMods.length
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
                                        checked={allEnabled}
                                        indeterminate={enabledCount > 0 && !allEnabled}
                                        disabled={!!loadingMod}
                                        onChange={() => setEnabled(groupMods, !allEnabled)}
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
                                            enabled={isEnabled(mod)}
                                            loadingMod={loadingMod}
                                            onToggle={() => setEnabled([mod], !isEnabled(mod))}
                                            onRemove={() => handleRemove([mod])}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                <button
                    onClick={onClose}
                    className="text-xs px-3 py-1.5 rounded border border-border bg-surface-hover hover:bg-surface-active transition-colors"
                >
                    {t('common.close')}
                </button>
                <button
                    onClick={handleApply}
                    disabled={pending.length === 0 || !!loadingMod}
                    className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {loadingMod
                        ? t('installed.manageFiles.applying')
                        : t('installed.manageFiles.apply', { count: pending.length })}
                </button>
            </div>
        </Dialog>
    )
}

function FileRow({
    mod,
    enabled,
    loadingMod,
    onToggle,
    onRemove,
}: {
    mod: InstalledMod
    enabled: boolean
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
                <Toggle checked={enabled} disabled={!!loadingMod} onChange={onToggle} />
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
