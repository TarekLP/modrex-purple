import { useState } from 'react'
import {
    X,
    Search,
    LayoutGrid,
    List,
    FolderOpen,
    FolderPlus,
    ChevronDown,
    ChevronRight,
    Pencil,
    Trash2,
    Check,
} from 'lucide-react'
import { t } from '../i18n'
import type { InstalledMod, ModFolder } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { ModCard } from './ModCard'
import { ModListRow } from './ModListRow'
import { SkeletonCard } from './SkeletonCard'
import { SkeletonListRow } from './SkeletonListRow'
import { Toggle } from './Toggle'
import { useModData } from '../hooks/useModData'
import { useDragDrop } from '../hooks/useDragDrop'
import {
    computeChildren,
    groupChildren,
    getAllModsInFolder,
    filterInstalled,
    syntheticMod,
} from '../hooks/installedUtils'
import { api } from '../api'

type ViewMode = 'grid' | 'list'

function getSavedViewMode(): ViewMode {
    const saved = localStorage.getItem('pd3mm:installed-view')
    return saved === 'list' ? 'list' : 'grid'
}

interface Props {
    gamePath: string | null
    installed: InstalledMod[]
    folders: ModFolder[]
    installedReady: boolean
    onRefreshInstalled: () => Promise<void>
    onOpenDetail: (modId: number) => void
}

export function InstalledPage({
    gamePath,
    installed,
    folders,
    installedReady,
    onRefreshInstalled,
    onOpenDetail,
}: Props) {
    const [viewMode, setViewMode] = useState<ViewMode>(getSavedViewMode)
    const { modData, failedIds, updatable } = useModData(installed)
    const [loadingMod, setLoadingMod] = useState<string | null>(null)
    const [loadingFolderId, setLoadingFolderId] = useState<string | null>(null)
    const [updatingAll, setUpdatingAll] = useState(false)
    const [updateError, setUpdateError] = useState<string | null>(null)
    const [showUpdates, setShowUpdates] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
    // undefined = not creating; null = creating at root; string = creating inside that folder
    const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null | undefined>(
        undefined
    )
    const [newFolderName, setNewFolderName] = useState('')
    const [filterQuery, setFilterQuery] = useState('')

    const isFiltering = filterQuery.trim().length > 0
    const { mods: displayMods, visibleFolderIds } = isFiltering
        ? filterInstalled(installed, folders, filterQuery.trim())
        : { mods: installed, visibleFolderIds: undefined }

    const {
        dragItem,
        dropTarget,
        scrollContainerRef,
        handleContainerDragOver,
        handleDragEnd,
        onModDragStart,
        onModDragOver,
        onFolderHeaderDragOver,
        onChildModDragOver,
        onEmptyFolderDragOver,
        handleGapDragOver,
        onModDropDirect,
        onModDrop,
        onDropIntoFolder,
        onFolderDragStart,
        onChildDrop,
        onNestFolderInto,
    } = useDragDrop({ installed, folders, gamePath, modData, onRefreshInstalled })

    function setView(mode: ViewMode) {
        setViewMode(mode)
        localStorage.setItem('pd3mm:installed-view', mode)
    }

    const rootChildren = computeChildren(displayMods, folders, null, visibleFolderIds)

    // --- Folder management ---

    function startRename(folder: ModFolder) {
        setRenamingFolderId(folder.id)
        setRenameValue(folder.displayName)
    }

    async function commitRename(folderId: string) {
        if (!gamePath || !renameValue.trim()) {
            setRenamingFolderId(null)
            return
        }
        await api.renameFolder(folderId, renameValue.trim(), gamePath)
        setRenamingFolderId(null)
        await onRefreshInstalled()
    }

    function handleDeleteFolder(folderId: string) {
        if (!gamePath) return
        setDeletingFolderId(folderId)
    }

    async function confirmDeleteFolder() {
        if (!deletingFolderId || !gamePath) return
        const folderId = deletingFolderId
        setDeletingFolderId(null)
        await api.deleteFolder(folderId, gamePath)
        await onRefreshInstalled()
    }

    async function handleCreateFolder() {
        if (creatingFolderParentId === undefined || !newFolderName.trim()) {
            setCreatingFolderParentId(undefined)
            setNewFolderName('')
            return
        }
        if (!gamePath) {
            setCreatingFolderParentId(undefined)
            setNewFolderName('')
            return
        }
        await api.createFolder(newFolderName.trim(), creatingFolderParentId, gamePath)
        setCreatingFolderParentId(undefined)
        setNewFolderName('')
        await onRefreshInstalled()
    }

    function toggleCollapse(folderId: string) {
        setCollapsedFolders((prev) => {
            const next = new Set(prev)
            next.has(folderId) ? next.delete(folderId) : next.add(folderId)
            return next
        })
    }

    async function handleUninstall(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.uninstallMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleToggleFolder(folderId: string, anyEnabled: boolean) {
        if (!gamePath) return
        setLoadingFolderId(folderId)
        try {
            const mods = getAllModsInFolder(installed, folders, folderId)
            for (const mod of mods) {
                if (anyEnabled) {
                    await api.disableMod(mod.uid, gamePath)
                } else {
                    await api.enableMod(mod.uid, gamePath)
                }
            }
            await onRefreshInstalled()
        } finally {
            setLoadingFolderId(null)
        }
    }

    async function handleEnable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.enableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.disableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUpdate(uid: string, modId: number) {
        if (!gamePath) return
        setLoadingMod(uid)
        setUpdateError(null)
        try {
            await api.installMod(modId, gamePath)
            await onRefreshInstalled()
        } catch {
            setUpdateError(t('installed.updatesModal.error'))
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUpdateSelected() {
        if (!gamePath) return
        setUpdatingAll(true)
        setUpdateError(null)
        try {
            for (const ins of updatable.filter((m) => selectedIds.has(m.id))) {
                await api.installMod(ins.id, gamePath)
            }
            await onRefreshInstalled()
            setShowUpdates(false)
        } catch {
            setUpdateError(t('installed.updatesModal.error'))
        } finally {
            setUpdatingAll(false)
        }
    }

    function toggleSelected(id: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    // --- Render helpers ---

    function renderModCard(mods: InstalledMod[]) {
        const ins = mods[0]
        const id = ins.id
        const repUid = ins.uid
        const apiMod = modData.get(id)
        if (!apiMod && !failedIds.has(id) && id >= 0) return <SkeletonListRow key={repUid} />
        const mod = apiMod ?? syntheticMod(ins)
        const isDragging = dragItem?.kind === 'mod' && dragItem.uid === repUid
        const isBusy = mods.some((m) => loadingMod === m.uid)
        const isBeforeActive = dropTarget?.kind === 'before-mod' && dropTarget.uid === repUid
        const isAfterActive = dropTarget?.kind === 'after-mod' && dropTarget.uid === repUid
        const combined: InstalledMod = {
            ...ins,
            enabled: mods.every((m) => m.enabled),
            missing: mods.some((m) => m.missing) ? true : undefined,
        }

        return (
            <div key={repUid} className="relative">
                <div
                    className="absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: -9, height: 36 }}
                    onDragOver={(e) => handleGapDragOver(e, repUid, true)}
                    onDrop={(e) => {
                        e.preventDefault()
                        onModDropDirect(repUid, true)
                    }}
                >
                    <div
                        className={`h-0.5 w-full mx-2 rounded-full pointer-events-none ${isBeforeActive ? 'bg-accent' : 'opacity-0'}`}
                    />
                </div>
                <div
                    className="absolute left-0 right-0 z-10 flex items-center"
                    style={{ bottom: -9, height: 36 }}
                    onDragOver={(e) => handleGapDragOver(e, repUid, false)}
                    onDrop={(e) => {
                        e.preventDefault()
                        onModDropDirect(repUid, false)
                    }}
                >
                    <div
                        className={`h-0.5 w-full mx-2 rounded-full pointer-events-none ${isAfterActive ? 'bg-accent' : 'opacity-0'}`}
                    />
                </div>
                {mods.length > 1 && (
                    <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-surface-raised/80 border border-border text-[10px] text-text-subtle pointer-events-none">
                        {t('installed.fileCount', { count: mods.length })}
                    </div>
                )}
                <ModListRow
                    mod={mod}
                    installed={combined}
                    gamePath={gamePath}
                    loading={isBusy}
                    isDragging={isDragging}
                    onOpen={apiMod ? () => onOpenDetail(id) : () => {}}
                    onUninstall={() => handleUninstall(mods)}
                    onEnable={() => handleEnable(mods)}
                    onDisable={() => handleDisable(mods)}
                    onDragStart={(e) => onModDragStart(e, repUid)}
                    onDragEnd={handleDragEnd}
                />
            </div>
        )
    }

    function renderModGridCard(mods: InstalledMod[]) {
        const ins = mods[0]
        const id = ins.id
        const repUid = ins.uid
        const apiMod = modData.get(id)
        if (!apiMod && !failedIds.has(id) && id >= 0) return <SkeletonCard key={repUid} />
        const mod = apiMod ?? syntheticMod(ins)
        const isDragging = dragItem?.kind === 'mod' && dragItem.uid === repUid
        const isBusy = mods.some((m) => loadingMod === m.uid)
        const combined: InstalledMod = {
            ...ins,
            enabled: mods.every((m) => m.enabled),
            missing: mods.some((m) => m.missing) ? true : undefined,
        }

        return (
            <div
                key={repUid}
                draggable
                onDragStart={(e) => onModDragStart(e, repUid)}
                onDragOver={(e) => onModDragOver(e, repUid)}
                onDrop={() => onModDrop(repUid)}
                onDragEnd={handleDragEnd}
                className={`relative h-full rounded-lg cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
            >
                {dropTarget?.kind === 'before-mod' && dropTarget.uid === repUid && (
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-accent z-10 pointer-events-none rounded-l-lg" />
                )}
                {dropTarget?.kind === 'after-mod' && dropTarget.uid === repUid && (
                    <div className="absolute top-0 bottom-0 right-0 w-1 bg-accent z-10 pointer-events-none rounded-r-lg" />
                )}
                {mods.length > 1 && (
                    <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-surface-raised/80 border border-border text-[10px] text-text-subtle pointer-events-none">
                        {t('installed.fileCount', { count: mods.length })}
                    </div>
                )}
                <ModCard
                    mod={mod}
                    installed={combined}
                    gamePath={gamePath}
                    loading={isBusy}
                    onOpen={apiMod ? () => onOpenDetail(id) : () => {}}
                    onInstall={() => {}}
                    onUninstall={() => handleUninstall(mods)}
                    onEnable={() => handleEnable(mods)}
                    onDisable={() => handleDisable(mods)}
                />
            </div>
        )
    }

    function renderNewFolderInput() {
        return (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-accent bg-accent/5">
                <FolderPlus className="w-3.5 h-3.5 text-accent shrink-0" />
                <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder()
                        if (e.key === 'Escape') {
                            setCreatingFolderParentId(undefined)
                            setNewFolderName('')
                        }
                    }}
                    onBlur={handleCreateFolder}
                    placeholder={t('installed.folder.renamePlaceholder')}
                    className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                />
                <button
                    onClick={handleCreateFolder}
                    className="p-1 text-accent hover:text-accent-bright transition-colors shrink-0"
                >
                    <Check className="w-3.5 h-3.5" />
                </button>
            </div>
        )
    }

    function renderFolderSection(folder: ModFolder) {
        const isCollapsed = !isFiltering && collapsedFolders.has(folder.id)
        const isRenaming = renamingFolderId === folder.id
        const isDraggingThisFolder = dragItem?.kind === 'folder' && dragItem.id === folder.id
        const isDropBeforeThis = dropTarget?.kind === 'before-child' && dropTarget.id === folder.id
        const isDropInto = dropTarget?.kind === 'into-folder' && dropTarget.folderId === folder.id

        const children = computeChildren(displayMods, folders, folder.id, visibleFolderIds)
        const directModGroups = children.filter(
            (c): c is { type: 'mod'; mods: InstalledMod[] } => c.type === 'mod'
        )
        const isEmpty = children.length === 0
        const allMods = getAllModsInFolder(installed, folders, folder.id)
        const anyEnabled = allMods.some((m) => m.enabled)
        const isFolderLoading = loadingFolderId === folder.id

        return (
            <div
                key={folder.id}
                className={`transition-opacity ${isDraggingThisFolder ? 'opacity-40' : 'opacity-100'}`}
            >
                {isDropBeforeThis && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
                {/* Folder header — entire row is draggable */}
                <div
                    draggable={!isRenaming}
                    onDragStart={(e) => onFolderDragStart(e, folder.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => onFolderHeaderDragOver(e, folder)}
                    onDrop={() => {
                        if (dragItem?.kind === 'mod') {
                            onDropIntoFolder(folder.id)
                        } else if (dragItem?.kind === 'folder') {
                            if (isDropInto) {
                                onNestFolderInto(dragItem.id, folder.id)
                            } else {
                                onChildDrop(dragItem.id, folder.id, 'folder', folder.parentId)
                            }
                        }
                    }}
                    className={`group flex items-center gap-1.5 px-2 py-2 rounded-lg border transition-colors ${
                        !isRenaming ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${
                        isDropInto
                            ? 'border-accent bg-accent/10'
                            : 'border-border bg-surface-raised'
                    }`}
                >
                    {/* Collapse toggle */}
                    <button
                        onClick={() => toggleCollapse(folder.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="text-text-subtle hover:text-text transition-colors shrink-0"
                    >
                        {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                        )}
                    </button>

                    {/* Folder name / rename input */}
                    {isRenaming ? (
                        <>
                            <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename(folder.id)
                                    if (e.key === 'Escape') setRenamingFolderId(null)
                                }}
                                onBlur={() => commitRename(folder.id)}
                                placeholder={t('installed.folder.renamePlaceholder')}
                                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none border-b border-accent"
                            />
                            <button
                                onClick={() => commitRename(folder.id)}
                                className="p-1 text-accent hover:text-accent-bright transition-colors shrink-0"
                            >
                                <Check className="w-3.5 h-3.5" />
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                            <span
                                className="text-sm font-medium truncate cursor-default"
                                onDoubleClick={() => startRename(folder)}
                            >
                                {folder.displayName}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    startRename(folder)
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                title={t('installed.folder.rename')}
                                className="p-0.5 text-text-subtle hover:text-text transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                            >
                                <Pencil className="w-3 h-3" />
                            </button>
                        </div>
                    )}

                    {/* Mod count */}
                    <span className="text-xs text-text-subtle leading-none shrink-0">
                        {t(
                            directModGroups.length === 1
                                ? 'installed.folder.modCountSingle'
                                : 'installed.folder.modCount',
                            { count: directModGroups.length }
                        )}
                    </span>

                    {!isRenaming && allMods.length > 0 && (
                        <div
                            className="flex items-center shrink-0"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <Toggle
                                checked={anyEnabled}
                                onChange={() => handleToggleFolder(folder.id, anyEnabled)}
                                disabled={isFolderLoading || !gamePath}
                                title={t(
                                    anyEnabled
                                        ? 'installed.folder.disable'
                                        : 'installed.folder.enable'
                                )}
                            />
                        </div>
                    )}

                    {/* New subfolder button */}
                    {!isRenaming && gamePath && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setCreatingFolderParentId(folder.id)
                                setNewFolderName('')
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title={t('installed.folder.newSubfolder')}
                            className="p-1.5 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors shrink-0"
                        >
                            <FolderPlus className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {/* Delete */}
                    {!isRenaming && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteFolder(folder.id)
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title={t('installed.folder.delete')}
                            className="p-1.5 rounded bg-danger hover:bg-danger-hover transition-colors shrink-0"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Folder contents */}
                {!isCollapsed && (
                    <div
                        className={`ml-4 flex flex-col ${viewMode === 'grid' ? 'mt-3 gap-3' : 'mt-1.5 gap-1.5'}`}
                    >
                        {/* New subfolder input */}
                        {creatingFolderParentId === folder.id && renderNewFolderInput()}

                        {isEmpty && creatingFolderParentId !== folder.id ? (
                            <div
                                className={`h-10 rounded-lg border border-dashed transition-colors flex items-center justify-center text-xs text-text-subtle ${
                                    isDropInto ? 'border-accent bg-accent/5' : 'border-border'
                                }`}
                                onDragOver={(e) => onEmptyFolderDragOver(e, folder.id)}
                                onDrop={() => {
                                    if (dragItem?.kind === 'mod') onDropIntoFolder(folder.id)
                                }}
                            >
                                {t('installed.folder.dropHere')}
                            </div>
                        ) : viewMode === 'list' ? (
                            children.map((child) => {
                                if (child.type === 'folder') {
                                    return renderFolderSection(child.folder)
                                }
                                const repUid = child.mods[0].uid
                                const isChildDropBefore =
                                    dragItem?.kind === 'folder' &&
                                    dropTarget?.kind === 'before-child' &&
                                    dropTarget.id === repUid
                                const isChildDropAfter =
                                    dragItem?.kind === 'folder' &&
                                    dropTarget?.kind === 'after-child' &&
                                    dropTarget.id === repUid
                                return (
                                    <div
                                        key={repUid}
                                        onDragOver={(e) => onChildModDragOver(e, repUid, folder.id)}
                                        onDrop={() =>
                                            dragItem?.kind === 'folder' &&
                                            onChildDrop(dragItem.id, repUid, 'mod', folder.id)
                                        }
                                    >
                                        {isChildDropBefore && (
                                            <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />
                                        )}
                                        {renderModCard(child.mods)}
                                        {isChildDropAfter && (
                                            <div className="h-0.5 rounded-full bg-accent mx-2 mt-1" />
                                        )}
                                    </div>
                                )
                            })
                        ) : (
                            groupChildren(children).map((group) => {
                                if (group.type === 'folder') {
                                    return renderFolderSection(group.folder)
                                }
                                return (
                                    <div
                                        key={`rg-${group.groups[0][0].uid}`}
                                        className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4"
                                    >
                                        {group.groups.map((mods) => renderModGridCard(mods))}
                                    </div>
                                )
                            })
                        )}
                    </div>
                )}
            </div>
        )
    }

    function renderRootMod(mods: InstalledMod[], isFolderDropZone = false) {
        const repUid = mods[0].uid
        const isDropBefore =
            isFolderDropZone &&
            dragItem?.kind === 'folder' &&
            dropTarget?.kind === 'before-child' &&
            dropTarget.id === repUid
        const isDropAfter =
            isFolderDropZone &&
            dragItem?.kind === 'folder' &&
            dropTarget?.kind === 'after-child' &&
            dropTarget.id === repUid

        if (viewMode === 'list') {
            return (
                <div
                    key={repUid}
                    onDragOver={
                        isFolderDropZone ? (e) => onChildModDragOver(e, repUid, null) : undefined
                    }
                    onDrop={
                        isFolderDropZone
                            ? () =>
                                  dragItem?.kind === 'folder' &&
                                  onChildDrop(dragItem.id, repUid, 'mod', null)
                            : undefined
                    }
                >
                    {isDropBefore && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
                    {renderModCard(mods)}
                    {isDropAfter && <div className="h-0.5 rounded-full bg-accent mx-2 mt-1" />}
                </div>
            )
        }
        return (
            <div key={repUid} className="relative">
                {renderModGridCard(mods)}
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border shrink-0 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-semibold">{t('installed.title')}</h1>
                        {gamePath && (
                            <button
                                onClick={() => api.openModsFolder()}
                                title={t('installed.openFolder')}
                                className="p-1 rounded bg-surface-hover hover:bg-surface-active text-text-subtle hover:text-text transition-colors"
                            >
                                <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {installed.length > 0 && (
                            <span className="text-xs text-text-subtle">
                                {isFiltering
                                    ? t('installed.modCountFiltered', {
                                          count: displayMods.length,
                                          total: installed.length,
                                      })
                                    : t(
                                          installed.length === 1
                                              ? 'installed.modCountSingle'
                                              : 'installed.modCount',
                                          { count: installed.length }
                                      )}
                            </span>
                        )}
                        {gamePath && (
                            <button
                                onClick={() => {
                                    setCreatingFolderParentId(null)
                                    setNewFolderName('')
                                }}
                                title={t('installed.newFolder')}
                                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-surface-hover hover:bg-surface-active text-text-subtle hover:text-text transition-colors"
                            >
                                <FolderPlus className="w-3.5 h-3.5" />
                                {t('installed.newFolder')}
                            </button>
                        )}
                        <div className="flex items-center gap-1 bg-surface-hover rounded p-0.5">
                            <button
                                onClick={() => setView('grid')}
                                title={t('installed.gridView')}
                                className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-surface-active text-text' : 'text-text-subtle hover:text-text'}`}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setView('list')}
                                title={t('installed.listView')}
                                className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'bg-surface-active text-text' : 'text-text-subtle hover:text-text'}`}
                            >
                                <List className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
                {installed.length > 0 && (
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle pointer-events-none" />
                        <input
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                            placeholder={t('installed.filterPlaceholder')}
                            className={`w-full text-sm pl-8 py-1.5 rounded bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors ${filterQuery ? 'pr-7' : 'pr-3'}`}
                        />
                        {filterQuery && (
                            <button
                                onClick={() => setFilterQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div
                ref={scrollContainerRef}
                onDragOver={handleContainerDragOver}
                className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3"
            >
                {!installedReady ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        {t('common.loading')}
                    </div>
                ) : installed.length === 0 && folders.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        {t('installed.empty')}
                    </div>
                ) : isFiltering && displayMods.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        {t('installed.filterEmpty', { query: filterQuery.trim() })}
                    </div>
                ) : (
                    <>
                        {updatable.length > 0 && (
                            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-accent/10 border border-accent/30">
                                <span className="text-sm font-medium text-accent">
                                    {t(
                                        updatable.length === 1
                                            ? 'installed.updatesAvailableSingle'
                                            : 'installed.updatesAvailable',
                                        { count: updatable.length }
                                    )}
                                </span>
                                <button
                                    onClick={() => {
                                        setSelectedIds(new Set(updatable.map((m) => m.id)))
                                        setShowUpdates(true)
                                    }}
                                    className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright transition-colors"
                                >
                                    {t('installed.reviewUpdates')}
                                </button>
                            </div>
                        )}

                        {/* New root folder input */}
                        {creatingFolderParentId === null && renderNewFolderInput()}

                        {/* Root-level items: folders and root mods interleaved by priority */}
                        {viewMode === 'list' ? (
                            <div className="flex flex-col gap-1.5">
                                {rootChildren.map((item) =>
                                    item.type === 'folder'
                                        ? renderFolderSection(item.folder)
                                        : renderRootMod(item.mods)
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {groupChildren(rootChildren).map((group) => {
                                    if (group.type === 'folder') {
                                        return renderFolderSection(group.folder)
                                    }
                                    const leaderId = group.groups[0][0].uid
                                    const isGroupDropBefore =
                                        dragItem?.kind === 'folder' &&
                                        dropTarget?.kind === 'before-child' &&
                                        dropTarget.id === leaderId
                                    const isGroupDropAfter =
                                        dragItem?.kind === 'folder' &&
                                        dropTarget?.kind === 'after-child' &&
                                        dropTarget.id === leaderId
                                    return (
                                        <div
                                            key={`rg-${leaderId}`}
                                            className="relative grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4"
                                            onDragOver={(e) =>
                                                onChildModDragOver(e, leaderId, null)
                                            }
                                            onDrop={() =>
                                                dragItem?.kind === 'folder' &&
                                                onChildDrop(dragItem.id, leaderId, 'mod', null)
                                            }
                                        >
                                            {isGroupDropBefore && (
                                                <div className="absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-accent pointer-events-none" />
                                            )}
                                            {isGroupDropAfter && (
                                                <div className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-accent pointer-events-none" />
                                            )}
                                            {group.groups.map((mods) => renderRootMod(mods))}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {showUpdates && (
                <div
                    className="absolute inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={(e) => e.target === e.currentTarget && setShowUpdates(false)}
                >
                    <div className="bg-surface-raised border border-border rounded-xl w-full max-w-lg mx-6 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <h2 className="text-sm font-semibold">
                                {t('installed.updatesModal.title', { count: updatable.length })}
                            </h2>
                            <button
                                onClick={() => setShowUpdates(false)}
                                className="text-text-subtle hover:text-text transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="overflow-y-auto max-h-96">
                            {updatable.map((ins) => {
                                const mod = modData.get(ins.id)!
                                const checked = selectedIds.has(ins.id)
                                const isLoading = loadingMod === ins.uid || updatingAll
                                return (
                                    <div
                                        key={ins.uid}
                                        className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={updatingAll}
                                            onChange={() => toggleSelected(ins.id)}
                                            className="accent-[oklch(0.65_0.18_47)] w-4 h-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                                        />
                                        <button
                                            onClick={() => {
                                                setShowUpdates(false)
                                                onOpenDetail(ins.id)
                                            }}
                                            className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                                        >
                                            {mod.thumbnail ? (
                                                <img
                                                    src={`${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`}
                                                    alt=""
                                                    className="w-9 h-9 rounded object-cover shrink-0"
                                                />
                                            ) : (
                                                <div className="w-9 h-9 rounded bg-surface-active shrink-0" />
                                            )}
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium truncate">
                                                    {mod.name}
                                                </div>
                                                <div className="text-xs text-text-subtle">
                                                    v{ins.version} to v{mod.version}
                                                </div>
                                            </div>
                                        </button>
                                        <button
                                            disabled={!gamePath || isLoading}
                                            onClick={() => handleUpdate(ins.uid, ins.id)}
                                            className="text-xs px-3 py-1 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                        >
                                            {loadingMod === ins.uid
                                                ? t('installed.updatesModal.updating')
                                                : t('installed.updatesModal.update')}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
                            {updateError && (
                                <span className="text-xs text-danger-text mr-auto">
                                    {updateError}
                                </span>
                            )}
                            <button
                                onClick={() => setShowUpdates(false)}
                                className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active transition-colors"
                            >
                                {t('common.close')}
                            </button>
                            <button
                                disabled={!gamePath || updatingAll || selectedIds.size === 0}
                                onClick={handleUpdateSelected}
                                className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {updatingAll
                                    ? t('installed.updatesModal.updating')
                                    : t('installed.updatesModal.updateSelected', {
                                          count: selectedIds.size,
                                      })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deletingFolderId !== null && (
                <div
                    className="absolute inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={(e) => e.target === e.currentTarget && setDeletingFolderId(null)}
                >
                    <div className="bg-surface-raised border border-border rounded-xl w-full max-w-sm mx-6 flex flex-col overflow-hidden">
                        <div className="px-5 py-4 border-b border-border">
                            <h2 className="text-sm font-semibold">
                                {t('installed.folder.delete')}
                            </h2>
                            <p className="text-xs text-text-muted mt-1">
                                {t('installed.folder.deleteConfirm')}
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4">
                            <button
                                onClick={() => setDeletingFolderId(null)}
                                className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={confirmDeleteFolder}
                                className="text-xs px-3 py-1 rounded bg-danger hover:bg-danger-hover transition-colors"
                            >
                                {t('installed.folder.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
