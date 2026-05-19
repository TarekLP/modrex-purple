import { useState, useEffect, useRef } from 'react'
import {
    X,
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
import type { Mod, InstalledMod, ModFolder, TopLevelItem } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { ModCard } from './ModCard'
import { ModListRow } from './ModListRow'
import { getCachedMod } from '../modCache'

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

function syntheticMod(ins: InstalledMod): Mod {
    return {
        id: ins.id,
        name: ins.name,
        desc: '',
        short_desc: 'Manually installed — not on modworkshop',
        version: ins.version,
        downloads: 0,
        likes: 0,
        views: 0,
        published_at: ins.installedAt,
        bumped_at: ins.installedAt,
        category_id: 0,
        has_download: false,
        thumbnail: null,
        download: null,
        user: { name: 'Unknown' },
    }
}

type DragItem = { kind: 'mod'; id: number } | { kind: 'folder'; id: string }

type DropTarget =
    | { kind: 'before-mod'; id: number }
    | { kind: 'after-mod'; id: number }
    | { kind: 'into-folder'; folderId: string }
    | { kind: 'before-top'; id: string | number; itemType: 'folder' | 'mod' }
    | null

type TopLevelEntry =
    | { type: 'folder'; folder: ModFolder; mods: InstalledMod[] }
    | { type: 'mod'; mod: InstalledMod }

type TopLevelGroup =
    | { type: 'folder'; folder: ModFolder; mods: InstalledMod[] }
    | { type: 'root-group'; mods: InstalledMod[] }

function groupTopLevel(entries: TopLevelEntry[]): TopLevelGroup[] {
    const groups: TopLevelGroup[] = []
    let run: InstalledMod[] = []
    for (const entry of entries) {
        if (entry.type === 'folder') {
            if (run.length > 0) {
                groups.push({ type: 'root-group', mods: run })
                run = []
            }
            groups.push({ type: 'folder', folder: entry.folder, mods: entry.mods })
        } else {
            run.push(entry.mod)
        }
    }
    if (run.length > 0) groups.push({ type: 'root-group', mods: run })
    return groups
}

function computeTopLevel(mods: InstalledMod[], folders: ModFolder[]): TopLevelEntry[] {
    const items: TopLevelEntry[] = []
    for (const mod of mods.filter((m) => (m.folderId ?? null) === null)) {
        items.push({ type: 'mod', mod })
    }
    for (const folder of folders) {
        const folderMods = mods
            .filter((m) => m.folderId === folder.id)
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        items.push({ type: 'folder', folder, mods: folderMods })
    }
    items.sort((a, b) => {
        const pa = a.type === 'folder' ? a.folder.priority : (a.mod.priority ?? 0)
        const pb = b.type === 'folder' ? b.folder.priority : (b.mod.priority ?? 0)
        return pb - pa
    })
    return items
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
    const [modData, setModData] = useState<Map<number, Mod>>(new Map())
    const [failedIds, setFailedIds] = useState<Set<number>>(new Set())
    const fetchedAt = useRef<Map<number, number>>(new Map())
    const [loadingMod, setLoadingMod] = useState<number | null>(null)
    const [updatingAll, setUpdatingAll] = useState(false)
    const [showUpdates, setShowUpdates] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [creatingFolder, setCreatingFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')

    // Drag state
    const [dragItem, setDragItem] = useState<DragItem | null>(null)
    const [dropTarget, setDropTarget] = useState<DropTarget>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const dragScrollFrame = useRef<number | null>(null)
    const dragScrollDir = useRef<'up' | 'down' | null>(null)
    const dragClientY = useRef<number>(0)

    function setView(mode: ViewMode) {
        setViewMode(mode)
        localStorage.setItem('pd3mm:installed-view', mode)
    }

    const topLevel = computeTopLevel(installed, folders)

    // Only the first root mod in each consecutive run is a valid folder drop boundary.
    const rootGroupLeaders = new Set<number>(
        topLevel.reduce<number[]>((acc, item, i) => {
            if (item.type === 'mod' && (i === 0 || topLevel[i - 1].type === 'folder'))
                acc.push(item.mod.id)
            return acc
        }, [])
    )

    function createDragImage(e: React.DragEvent, mod: Mod) {
        const el = document.createElement('div')
        el.style.cssText =
            'position:fixed;top:-9999px;left:-9999px;display:flex;flex-direction:column;' +
            'background:#18181b;border:1px solid #27272a;border-radius:8px;' +
            'box-shadow:0 4px 16px rgba(0,0,0,0.6);width:160px;overflow:hidden;pointer-events:none;'
        if (mod.thumbnail) {
            const img = document.createElement('img')
            img.src = `${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`
            img.style.cssText = 'width:160px;height:90px;object-fit:cover;display:block;'
            el.appendChild(img)
        } else {
            const placeholder = document.createElement('div')
            placeholder.style.cssText = 'width:160px;height:90px;background:#27272a;'
            el.appendChild(placeholder)
        }
        const name = document.createElement('span')
        name.textContent = mod.name
        name.style.cssText =
            'font-size:12px;color:#f4f4f3;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
        el.appendChild(name)
        document.body.appendChild(el)
        e.dataTransfer.setDragImage(el, 80, 45)
        requestAnimationFrame(() => document.body.removeChild(el))
    }

    function stopAutoScroll() {
        if (dragScrollFrame.current !== null) {
            cancelAnimationFrame(dragScrollFrame.current)
            dragScrollFrame.current = null
        }
    }

    function handleContainerDragOver(e: React.DragEvent) {
        dragClientY.current = e.clientY
        const container = scrollContainerRef.current
        if (!container) return
        const { top, bottom } = container.getBoundingClientRect()
        const ZONE = 80
        let dir: 'up' | 'down' | null = null
        if (e.clientY < top + ZONE) dir = 'up'
        else if (e.clientY > bottom - ZONE) dir = 'down'
        if (dir !== dragScrollDir.current) {
            dragScrollDir.current = dir
            stopAutoScroll()
            if (dir) {
                const loop = () => {
                    if (!dragScrollDir.current) return
                    const ct = scrollContainerRef.current
                    if (!ct) return
                    const { top: t, bottom: b } = ct.getBoundingClientRect()
                    const y = dragClientY.current
                    const ratio =
                        dragScrollDir.current === 'up'
                            ? (t + ZONE - y) / ZONE
                            : (y - (b - ZONE)) / ZONE
                    const speed = Math.round(Math.min(1, ratio) * 12)
                    ct.scrollBy(0, dragScrollDir.current === 'up' ? -speed : speed)
                    dragScrollFrame.current = requestAnimationFrame(loop)
                }
                dragScrollFrame.current = requestAnimationFrame(loop)
            }
        }
    }

    function handleDragEnd() {
        setDragItem(null)
        setDropTarget(null)
        stopAutoScroll()
        dragScrollDir.current = null
    }

    function onModDragStart(e: React.DragEvent, modId: number) {
        const mod = modData.get(modId) ?? syntheticMod(installed.find((m) => m.id === modId)!)
        setDragItem({ kind: 'mod', id: modId })
        createDragImage(e, mod)
    }

    function onModDragOver(e: React.DragEvent, modId: number) {
        if (!dragItem || dragItem.id === modId) return
        e.preventDefault()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const isTop = e.clientY - rect.top < rect.height / 2
        setDropTarget(isTop ? { kind: 'before-mod', id: modId } : { kind: 'after-mod', id: modId })
    }

    function onFolderHeaderDragOver(e: React.DragEvent, folderId: string) {
        if (!dragItem) return
        e.preventDefault()
        if (dragItem.kind === 'mod') {
            setDropTarget({ kind: 'into-folder', folderId })
        } else {
            setDropTarget({ kind: 'before-top', id: folderId, itemType: 'folder' })
        }
    }

    function onTopLevelModDragOver(e: React.DragEvent, modId: number) {
        if (!dragItem || dragItem.kind !== 'folder') return
        e.preventDefault()
        setDropTarget({ kind: 'before-top', id: modId, itemType: 'mod' })
    }

    async function onModDrop(targetModId: number) {
        if (!dragItem || dragItem.kind !== 'mod' || !gamePath) return
        const srcId = dragItem.id
        setDragItem(null)
        setDropTarget(null)
        if (targetModId === srcId) return

        const srcMod = installed.find((m) => m.id === srcId)!
        const targetMod = installed.find((m) => m.id === targetModId)!
        const srcFolderId = srcMod.folderId ?? null
        const targetFolderId = targetMod.folderId ?? null

        const isBefore = dropTarget?.kind === 'before-mod'

        if (srcFolderId === targetFolderId) {
            const scopedMods = topLevel.flatMap((item) => {
                if (item.type === 'mod' && (item.mod.folderId ?? null) === srcFolderId)
                    return [item.mod]
                if (item.type === 'folder' && item.folder.id === srcFolderId) return item.mods
                return []
            })
            const order = scopedMods.map((m) => m.id)
            const fromIdx = order.indexOf(srcId)
            order.splice(fromIdx, 1)
            const toIdx = order.indexOf(targetModId)
            order.splice(isBefore ? toIdx : toIdx + 1, 0, srcId)
            await window.api.reorderModsInFolder(srcFolderId, order, gamePath)
        } else {
            const targetScopeMods = (
                targetFolderId === null
                    ? topLevel.flatMap((item) =>
                          item.type === 'mod' && (item.mod.folderId ?? null) === null
                              ? [item.mod]
                              : []
                      )
                    : (topLevel.find(
                          (item): item is Extract<TopLevelEntry, { type: 'folder' }> =>
                              item.type === 'folder' && item.folder.id === targetFolderId
                      )?.mods ?? [])
            ).filter((m) => m.id !== srcId)

            const toIdx = targetScopeMods.findIndex((m) => m.id === targetModId)
            const targetPosition = isBefore ? toIdx : toIdx + 1
            await window.api.moveModToFolder(srcId, targetFolderId, targetPosition, gamePath)
        }
        await onRefreshInstalled()
    }

    async function onDropIntoFolder(folderId: string) {
        if (!dragItem || dragItem.kind !== 'mod' || !gamePath) return
        const srcId = dragItem.id
        setDragItem(null)
        setDropTarget(null)
        const srcMod = installed.find((m) => m.id === srcId)!
        if ((srcMod.folderId ?? null) === folderId) return
        const folderEntry = topLevel.find(
            (item) => item.type === 'folder' && item.folder.id === folderId
        )
        const folderMods = folderEntry?.type === 'folder' ? folderEntry.mods : []
        await window.api.moveModToFolder(srcId, folderId, folderMods.length, gamePath)
        await onRefreshInstalled()
    }

    function onFolderDragStart(e: React.DragEvent, folderId: string) {
        e.dataTransfer.effectAllowed = 'move'
        setDragItem({ kind: 'folder', id: folderId })
    }

    async function onTopLevelDrop(targetId: string | number, targetItemType: 'folder' | 'mod') {
        if (!dragItem || dragItem.kind !== 'folder' || !gamePath) return
        const srcFolderId = dragItem.id
        setDragItem(null)
        setDropTarget(null)
        if (targetItemType === 'folder' && targetId === srcFolderId) return

        const items: TopLevelItem[] = topLevel
            .filter((item) => (item.type === 'folder' ? item.folder.id !== srcFolderId : true))
            .map((item) =>
                item.type === 'folder'
                    ? { type: 'folder' as const, id: item.folder.id }
                    : { type: 'mod' as const, id: item.mod.id }
            )
        const insertIdx = items.findIndex(
            (item) =>
                item.type === targetItemType &&
                (targetItemType === 'folder'
                    ? (item as { type: 'folder'; id: string }).id === targetId
                    : (item as { type: 'mod'; id: number }).id === targetId)
        )
        items.splice(insertIdx, 0, { type: 'folder', id: srcFolderId })
        await window.api.reorderTopLevel(items, gamePath)
        await onRefreshInstalled()
    }

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
        await window.api.renameFolder(folderId, renameValue.trim(), gamePath)
        setRenamingFolderId(null)
        await onRefreshInstalled()
    }

    async function handleDeleteFolder(folderId: string) {
        if (!gamePath) return
        if (!window.confirm(t('installed.folder.deleteConfirm'))) return
        await window.api.deleteFolder(folderId, gamePath)
        await onRefreshInstalled()
    }

    async function handleCreateFolder() {
        if (!gamePath || !newFolderName.trim()) {
            setCreatingFolder(false)
            setNewFolderName('')
            return
        }
        await window.api.createFolder(newFolderName.trim(), gamePath)
        setCreatingFolder(false)
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

    // --- Mod data fetching ---

    useEffect(() => {
        const TTL_MS = 5 * 60 * 1000
        const now = Date.now()
        const stale = installed.filter((m) => {
            const t = fetchedAt.current.get(m.id)
            return t === undefined || now - t >= TTL_MS
        })
        if (stale.length === 0) return
        Promise.allSettled(stale.map((m) => getCachedMod(m.id))).then((results) => {
            const updates: [number, Mod][] = []
            const failed: number[] = []
            results.forEach((r, i) => {
                fetchedAt.current.set(stale[i].id, Date.now())
                if (r.status === 'fulfilled') {
                    updates.push([stale[i].id, r.value])
                } else {
                    failed.push(stale[i].id)
                }
            })
            if (updates.length > 0) {
                setModData((prev) => {
                    const next = new Map(prev)
                    updates.forEach(([id, mod]) => next.set(id, mod))
                    return next
                })
            }
            if (failed.length > 0) {
                setFailedIds((prev) => new Set([...prev, ...failed]))
            }
        })
    }, [installed])

    const updatable = installed.filter((ins) => {
        const mod = modData.get(ins.id)
        return mod && mod.version !== ins.version
    })

    async function handleUninstall(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.uninstallMod(modId, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.enableMod(modId, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.disableMod(modId, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUpdate(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.installMod(modId, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUpdateSelected() {
        if (!gamePath) return
        setUpdatingAll(true)
        try {
            for (const ins of updatable.filter((m) => selectedIds.has(m.id))) {
                await window.api.installMod(ins.id, gamePath)
            }
            await onRefreshInstalled()
            setShowUpdates(false)
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

    function renderModCard(ins: InstalledMod) {
        const id = ins.id
        const apiMod = modData.get(id)
        if (!apiMod && !failedIds.has(id)) return null
        const mod = apiMod ?? syntheticMod(ins)
        const isDragging = dragItem?.kind === 'mod' && dragItem.id === id
        const target = dropTarget
        const isBefore = target?.kind === 'before-mod' && target.id === id
        const isAfter = target?.kind === 'after-mod' && target.id === id

        return (
            <div key={id} className="relative">
                {isBefore && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
                <ModListRow
                    mod={mod}
                    installed={ins}
                    gamePath={gamePath}
                    loading={loadingMod === id}
                    isDragging={isDragging}
                    onOpen={apiMod ? () => onOpenDetail(id) : () => {}}
                    onUninstall={() => handleUninstall(id)}
                    onEnable={() => handleEnable(id)}
                    onDisable={() => handleDisable(id)}
                    onDragStart={(e) => onModDragStart(e, id)}
                    onDragOver={(e) => onModDragOver(e, id)}
                    onDrop={() => onModDrop(id)}
                    onDragEnd={handleDragEnd}
                />
                {isAfter && <div className="h-0.5 rounded-full bg-accent mx-2 mt-1" />}
            </div>
        )
    }

    function renderModGridCard(ins: InstalledMod) {
        const id = ins.id
        const apiMod = modData.get(id)
        if (!apiMod && !failedIds.has(id)) return null
        const mod = apiMod ?? syntheticMod(ins)
        const isDragging = dragItem?.kind === 'mod' && dragItem.id === id

        return (
            <div
                key={id}
                draggable
                onDragStart={(e) => onModDragStart(e, id)}
                onDragOver={(e) => onModDragOver(e, id)}
                onDrop={() => onModDrop(id)}
                onDragEnd={handleDragEnd}
                className={`relative h-full rounded-lg cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
            >
                {dropTarget?.kind === 'before-mod' && dropTarget.id === id && (
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-accent z-10 pointer-events-none rounded-l-lg" />
                )}
                {dropTarget?.kind === 'after-mod' && dropTarget.id === id && (
                    <div className="absolute top-0 bottom-0 right-0 w-1 bg-accent z-10 pointer-events-none rounded-r-lg" />
                )}
                <ModCard
                    mod={mod}
                    installed={ins}
                    gamePath={gamePath}
                    loading={loadingMod === id}
                    onOpen={apiMod ? () => onOpenDetail(id) : () => {}}
                    onInstall={() => {}}
                    onUninstall={() => handleUninstall(id)}
                    onEnable={() => handleEnable(id)}
                    onDisable={() => handleDisable(id)}
                />
            </div>
        )
    }

    function renderFolderSection(folder: ModFolder, mods: InstalledMod[]) {
        const isCollapsed = collapsedFolders.has(folder.id)
        const isRenaming = renamingFolderId === folder.id
        const isDraggingThisFolder = dragItem?.kind === 'folder' && dragItem.id === folder.id
        const isDropTarget = dropTarget?.kind === 'before-top' && dropTarget.id === folder.id
        const isDropInto = dropTarget?.kind === 'into-folder' && dropTarget.folderId === folder.id

        return (
            <div
                key={folder.id}
                className={`transition-opacity ${isDraggingThisFolder ? 'opacity-40' : 'opacity-100'}`}
            >
                {isDropTarget && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
                {/* Folder header — the whole row is the drag handle */}
                <div
                    draggable={!isRenaming}
                    onDragStart={(e) => onFolderDragStart(e, folder.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => onFolderHeaderDragOver(e, folder.id)}
                    onDrop={() => {
                        if (dragItem?.kind === 'mod') onDropIntoFolder(folder.id)
                        else onTopLevelDrop(folder.id, 'folder')
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
                    <span className="text-xs text-text-subtle shrink-0">
                        {t(
                            mods.length === 1
                                ? 'installed.folder.modCountSingle'
                                : 'installed.folder.modCount',
                            { count: mods.length }
                        )}
                    </span>

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
                {!isCollapsed && mods.length > 0 && (
                    <div
                        className={`ml-4 mt-1 ${viewMode === 'grid' ? 'grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4' : 'flex flex-col gap-1'}`}
                    >
                        {viewMode === 'list'
                            ? mods.map((ins) => renderModCard(ins)).filter(Boolean)
                            : mods.map((ins) => renderModGridCard(ins)).filter(Boolean)}
                    </div>
                )}
                {!isCollapsed && mods.length === 0 && (
                    <div
                        className={`ml-4 mt-1 h-10 rounded-lg border border-dashed transition-colors flex items-center justify-center text-xs text-text-subtle ${
                            isDropInto ? 'border-accent bg-accent/5' : 'border-border'
                        }`}
                        onDragOver={(e) => {
                            if (dragItem?.kind === 'mod') {
                                e.preventDefault()
                                setDropTarget({ kind: 'into-folder', folderId: folder.id })
                            }
                        }}
                        onDrop={() => {
                            if (dragItem?.kind === 'mod') onDropIntoFolder(folder.id)
                        }}
                    >
                        {t('installed.folder.dropHere')}
                    </div>
                )}
            </div>
        )
    }

    function renderRootMod(ins: InstalledMod, isFolderDropZone = false) {
        const isDropTarget =
            isFolderDropZone &&
            dragItem?.kind === 'folder' &&
            dropTarget?.kind === 'before-top' &&
            dropTarget.id === ins.id

        if (viewMode === 'list') {
            return (
                <div
                    key={ins.id}
                    onDragOver={
                        isFolderDropZone ? (e) => onTopLevelModDragOver(e, ins.id) : undefined
                    }
                    onDrop={isFolderDropZone ? () => onTopLevelDrop(ins.id, 'mod') : undefined}
                >
                    {isDropTarget && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
                    {renderModCard(ins)}
                </div>
            )
        }
        return (
            <div key={ins.id} className="relative">
                {renderModGridCard(ins)}
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold">{t('installed.title')}</h1>
                    {gamePath && (
                        <button
                            onClick={() =>
                                window.api.openPath(`${gamePath}/PAYDAY3/Content/Paks/~mods`)
                            }
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
                            {t(
                                installed.length === 1
                                    ? 'installed.modCountSingle'
                                    : 'installed.modCount',
                                { count: installed.length }
                            )}
                        </span>
                    )}
                    {gamePath && (
                        <button
                            onClick={() => setCreatingFolder(true)}
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

                        {/* New folder input */}
                        {creatingFolder && (
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-accent bg-accent/5">
                                <FolderPlus className="w-3.5 h-3.5 text-accent shrink-0" />
                                <input
                                    autoFocus
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateFolder()
                                        if (e.key === 'Escape') {
                                            setCreatingFolder(false)
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
                        )}

                        {/* Top-level items: folders and root mods interleaved by priority */}
                        {viewMode === 'list' ? (
                            <div className="flex flex-col gap-1.5">
                                {topLevel.map((item) =>
                                    item.type === 'folder'
                                        ? renderFolderSection(item.folder, item.mods)
                                        : renderRootMod(item.mod, rootGroupLeaders.has(item.mod.id))
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {groupTopLevel(topLevel).map((group) => {
                                    if (group.type === 'folder') {
                                        return renderFolderSection(group.folder, group.mods)
                                    }
                                    const leaderId = group.mods[0].id
                                    const isGroupDropTarget =
                                        dragItem?.kind === 'folder' &&
                                        dropTarget?.kind === 'before-top' &&
                                        dropTarget.id === leaderId
                                    return (
                                        <div
                                            key={`rg-${leaderId}`}
                                            className="relative grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4"
                                            onDragOver={(e) => onTopLevelModDragOver(e, leaderId)}
                                            onDrop={() => onTopLevelDrop(leaderId, 'mod')}
                                        >
                                            {isGroupDropTarget && (
                                                <div className="absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-accent pointer-events-none" />
                                            )}
                                            {group.mods.map((ins) => renderRootMod(ins))}
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
                                const isLoading = loadingMod === ins.id || updatingAll
                                return (
                                    <div
                                        key={ins.id}
                                        className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={updatingAll}
                                            onChange={() => toggleSelected(ins.id)}
                                            className="accent-[oklch(0.65_0.18_47)] w-4 h-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                                        />
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <span className="text-sm font-medium truncate">
                                                {mod.name}
                                            </span>
                                            <span className="text-xs text-text-subtle shrink-0">
                                                v{ins.version} → v{mod.version}
                                            </span>
                                        </div>
                                        <button
                                            disabled={!gamePath || isLoading}
                                            onClick={() => handleUpdate(ins.id)}
                                            className="text-xs px-3 py-1 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                        >
                                            {loadingMod === ins.id
                                                ? t('installed.updatesModal.updating')
                                                : t('installed.updatesModal.update')}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
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
        </div>
    )
}
