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

type DragItem = { kind: 'mod'; uid: string } | { kind: 'folder'; id: string }

type DropTarget =
    | { kind: 'before-mod'; uid: string }
    | { kind: 'after-mod'; uid: string }
    | { kind: 'into-folder'; folderId: string }
    | {
          kind: 'before-child'
          id: string
          itemType: 'folder' | 'mod'
          parentId: string | null
      }
    | null

type ChildEntry = { type: 'folder'; folder: ModFolder } | { type: 'mod'; mods: InstalledMod[] }

type ChildGroup =
    | { type: 'folder'; folder: ModFolder }
    | { type: 'root-group'; groups: InstalledMod[][] }

function computeChildren(
    mods: InstalledMod[],
    folders: ModFolder[],
    parentId: string | null
): ChildEntry[] {
    const scopedMods = mods.filter((m) => (m.folderId ?? null) === parentId)
    const groupMap = new Map<number, InstalledMod[]>()
    for (const m of scopedMods) {
        if (!groupMap.has(m.id)) groupMap.set(m.id, [])
        groupMap.get(m.id)!.push(m)
    }
    const items: ChildEntry[] = []
    for (const groupMods of groupMap.values()) {
        groupMods.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        items.push({ type: 'mod', mods: groupMods })
    }
    for (const folder of folders.filter((f) => f.parentId === parentId)) {
        items.push({ type: 'folder', folder })
    }
    items.sort((a, b) => {
        const pa =
            a.type === 'folder'
                ? a.folder.priority
                : Math.min(...a.mods.map((m) => m.priority ?? 0))
        const pb =
            b.type === 'folder'
                ? b.folder.priority
                : Math.min(...b.mods.map((m) => m.priority ?? 0))
        return pb - pa
    })
    return items
}

function groupChildren(entries: ChildEntry[]): ChildGroup[] {
    const groups: ChildGroup[] = []
    let run: InstalledMod[][] = []
    for (const entry of entries) {
        if (entry.type === 'folder') {
            if (run.length > 0) {
                groups.push({ type: 'root-group', groups: run })
                run = []
            }
            groups.push({ type: 'folder', folder: entry.folder })
        } else {
            run.push(entry.mods)
        }
    }
    if (run.length > 0) groups.push({ type: 'root-group', groups: run })
    return groups
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
    const [loadingMod, setLoadingMod] = useState<string | null>(null)
    const [updatingAll, setUpdatingAll] = useState(false)
    const [showUpdates, setShowUpdates] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    // undefined = not creating; null = creating at root; string = creating inside that folder
    const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null | undefined>(
        undefined
    )
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

    const rootChildren = computeChildren(installed, folders, null)

    // Only the first mod in each consecutive root-mod run is a valid folder drop boundary (grid view).
    const rootGroupLeaders = new Set<string>(
        rootChildren.reduce<string[]>((acc, item, i) => {
            if (item.type === 'mod' && (i === 0 || rootChildren[i - 1].type === 'folder'))
                acc.push(item.mods[0].uid)
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

    function onModDragStart(e: React.DragEvent, uid: string) {
        const ins = installed.find((m) => m.uid === uid)!
        const mod = modData.get(ins.id) ?? syntheticMod(ins)
        setDragItem({ kind: 'mod', uid })
        createDragImage(e, mod)
    }

    function onModDragOver(e: React.DragEvent, uid: string) {
        if (!dragItem || (dragItem.kind === 'mod' && dragItem.uid === uid)) return
        e.preventDefault()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const isTop = e.clientY - rect.top < rect.height / 2
        setDropTarget(isTop ? { kind: 'before-mod', uid } : { kind: 'after-mod', uid })
    }

    function onFolderHeaderDragOver(e: React.DragEvent, folder: ModFolder) {
        if (!dragItem) return
        e.preventDefault()
        if (dragItem.kind === 'mod') {
            setDropTarget({ kind: 'into-folder', folderId: folder.id })
        } else {
            // folder dragged over folder header: bottom half = nest inside, top half = reorder before
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const isBottom = e.clientY - rect.top > rect.height / 2
            if (isBottom && folder.id !== dragItem.id) {
                setDropTarget({ kind: 'into-folder', folderId: folder.id })
            } else {
                setDropTarget({
                    kind: 'before-child',
                    id: folder.id,
                    itemType: 'folder',
                    parentId: folder.parentId,
                })
            }
        }
    }

    function onChildModDragOver(e: React.DragEvent, uid: string, parentId: string | null) {
        if (!dragItem || dragItem.kind !== 'folder') return
        e.preventDefault()
        setDropTarget({ kind: 'before-child', id: uid, itemType: 'mod', parentId })
    }

    async function onModDrop(targetRepUid: string) {
        if (!dragItem || dragItem.kind !== 'mod' || !gamePath) return
        const srcRepUid = dragItem.uid
        setDragItem(null)
        setDropTarget(null)
        if (targetRepUid === srcRepUid) return

        const srcMod = installed.find((m) => m.uid === srcRepUid)!
        const targetMod = installed.find((m) => m.uid === targetRepUid)!
        const srcFolderId = srcMod.folderId ?? null
        const targetFolderId = targetMod.folderId ?? null
        const isBefore = dropTarget?.kind === 'before-mod'

        const srcGroupMods = installed
            .filter((m) => (m.folderId ?? null) === srcFolderId && m.id === srcMod.id)
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

        if (srcFolderId === targetFolderId) {
            const scopedMods = installed
                .filter((m) => (m.folderId ?? null) === srcFolderId)
                .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            const withoutSrc = scopedMods.filter((m) => m.id !== srcMod.id)
            const targetGroupMods = withoutSrc.filter((m) => m.id === targetMod.id)
            const pivotUid = isBefore
                ? targetGroupMods[0].uid
                : targetGroupMods[targetGroupMods.length - 1].uid
            const pivotIdx = withoutSrc.findIndex((m) => m.uid === pivotUid)
            const insertAt = isBefore ? pivotIdx : pivotIdx + 1
            const reordered = [...withoutSrc]
            reordered.splice(insertAt, 0, ...srcGroupMods)
            await window.api.reorderModsInFolder(
                srcFolderId,
                reordered.map((m) => m.uid),
                gamePath
            )
        } else {
            const targetScopeMods = installed
                .filter((m) => (m.folderId ?? null) === targetFolderId && m.id !== srcMod.id)
                .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            const toIdx = targetScopeMods.findIndex((m) => m.uid === targetRepUid)
            const targetPosition = isBefore ? toIdx : toIdx + 1
            for (const m of srcGroupMods) {
                await window.api.moveModToFolder(m.uid, targetFolderId, targetPosition, gamePath)
            }
        }
        await onRefreshInstalled()
    }

    async function onDropIntoFolder(folderId: string) {
        if (!dragItem || dragItem.kind !== 'mod' || !gamePath) return
        const srcRepUid = dragItem.uid
        setDragItem(null)
        setDropTarget(null)
        const srcMod = installed.find((m) => m.uid === srcRepUid)!
        if ((srcMod.folderId ?? null) === folderId) return
        const srcGroupMods = installed.filter(
            (m) => (m.folderId ?? null) === (srcMod.folderId ?? null) && m.id === srcMod.id
        )
        const folderMods = installed.filter((m) => m.folderId === folderId)
        for (const m of srcGroupMods) {
            await window.api.moveModToFolder(m.uid, folderId, folderMods.length, gamePath)
        }
        await onRefreshInstalled()
    }

    function onFolderDragStart(e: React.DragEvent, folderId: string) {
        e.dataTransfer.effectAllowed = 'move'
        setDragItem({ kind: 'folder', id: folderId })
    }

    // Handles folder being dragged before another item (mod or folder) within a parent context.
    // If the dragged folder is from a different parent, moves it first then reorders.
    async function onChildDrop(
        srcFolderId: string,
        targetId: string,
        targetItemType: 'folder' | 'mod',
        parentId: string | null
    ) {
        if (!gamePath) return
        setDragItem(null)
        setDropTarget(null)
        if (targetItemType === 'folder' && targetId === srcFolderId) return

        const contextItems = computeChildren(installed, folders, parentId)
        const items: TopLevelItem[] = contextItems
            .filter((item) => !(item.type === 'folder' && item.folder.id === srcFolderId))
            .flatMap((item): TopLevelItem[] =>
                item.type === 'folder'
                    ? [{ type: 'folder', id: item.folder.id }]
                    : item.mods.map((m) => ({ type: 'mod', id: m.uid }))
            )

        const insertIdx = items.findIndex(
            (item) => item.type === targetItemType && item.id === targetId
        )
        if (insertIdx === -1) return
        items.splice(insertIdx, 0, { type: 'folder', id: srcFolderId })

        const draggedFolder = folders.find((f) => f.id === srcFolderId)
        if (draggedFolder && draggedFolder.parentId !== parentId) {
            await window.api.moveFolder(srcFolderId, parentId, gamePath)
        }
        await window.api.reorderChildren(parentId, items, gamePath)
        await onRefreshInstalled()
    }

    // Nests a folder inside another folder (moves it to targetFolderId as parent).
    async function onNestFolderInto(srcFolderId: string, targetFolderId: string) {
        if (!gamePath || srcFolderId === targetFolderId) return
        setDragItem(null)
        setDropTarget(null)
        await window.api.moveFolder(srcFolderId, targetFolderId, gamePath)
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
        await window.api.createFolder(newFolderName.trim(), creatingFolderParentId, gamePath)
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

    const seenModIds = new Set<number>()
    const updatable = installed.filter((ins) => {
        if (seenModIds.has(ins.id)) return false
        const mod = modData.get(ins.id)
        if (mod && mod.version !== ins.version) {
            seenModIds.add(ins.id)
            return true
        }
        return false
    })

    async function handleUninstall(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await window.api.uninstallMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await window.api.enableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await window.api.disableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUpdate(uid: string, modId: number) {
        if (!gamePath) return
        setLoadingMod(uid)
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

    function renderModCard(mods: InstalledMod[]) {
        const ins = mods[0]
        const id = ins.id
        const repUid = ins.uid
        const apiMod = modData.get(id)
        if (!apiMod && !failedIds.has(id)) return null
        const mod = apiMod ?? syntheticMod(ins)
        const isDragging = dragItem?.kind === 'mod' && dragItem.uid === repUid
        const isBusy = mods.some((m) => loadingMod === m.uid)
        const isBefore = dropTarget?.kind === 'before-mod' && dropTarget.uid === repUid
        const isAfter = dropTarget?.kind === 'after-mod' && dropTarget.uid === repUid
        const combined: InstalledMod = {
            ...ins,
            enabled: mods.every((m) => m.enabled),
            missing: mods.some((m) => m.missing) ? true : undefined,
        }

        return (
            <div key={repUid} className="relative">
                {isBefore && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
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
                    onDragOver={(e) => onModDragOver(e, repUid)}
                    onDrop={() => onModDrop(repUid)}
                    onDragEnd={handleDragEnd}
                />
                {isAfter && <div className="h-0.5 rounded-full bg-accent mx-2 mt-1" />}
            </div>
        )
    }

    function renderModGridCard(mods: InstalledMod[]) {
        const ins = mods[0]
        const id = ins.id
        const repUid = ins.uid
        const apiMod = modData.get(id)
        if (!apiMod && !failedIds.has(id)) return null
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
        const isCollapsed = collapsedFolders.has(folder.id)
        const isRenaming = renamingFolderId === folder.id
        const isDraggingThisFolder = dragItem?.kind === 'folder' && dragItem.id === folder.id
        const isDropBeforeThis = dropTarget?.kind === 'before-child' && dropTarget.id === folder.id
        const isDropInto = dropTarget?.kind === 'into-folder' && dropTarget.folderId === folder.id

        const children = computeChildren(installed, folders, folder.id)
        const directModGroups = children.filter(
            (c): c is { type: 'mod'; mods: InstalledMod[] } => c.type === 'mod'
        )
        const isEmpty = children.length === 0

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
                    <span className="text-xs text-text-subtle shrink-0">
                        {t(
                            directModGroups.length === 1
                                ? 'installed.folder.modCountSingle'
                                : 'installed.folder.modCount',
                            { count: directModGroups.length }
                        )}
                    </span>

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
                            className="p-1 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors shrink-0 opacity-0 group-hover:opacity-100"
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
                            className="p-2 rounded bg-danger hover:bg-danger-hover transition-colors shrink-0"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Folder contents */}
                {!isCollapsed && (
                    <div className="ml-4 mt-1 flex flex-col gap-1.5">
                        {/* New subfolder input */}
                        {creatingFolderParentId === folder.id && renderNewFolderInput()}

                        {isEmpty && creatingFolderParentId !== folder.id ? (
                            <div
                                className={`h-10 rounded-lg border border-dashed transition-colors flex items-center justify-center text-xs text-text-subtle ${
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
                        ) : viewMode === 'list' ? (
                            children.map((child) => {
                                if (child.type === 'folder') {
                                    return renderFolderSection(child.folder)
                                }
                                const repUid = child.mods[0].uid
                                const isChildDropZone =
                                    dragItem?.kind === 'folder' &&
                                    dropTarget?.kind === 'before-child' &&
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
                                        {isChildDropZone && (
                                            <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />
                                        )}
                                        {renderModCard(child.mods)}
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
        const isDropTarget =
            isFolderDropZone &&
            dragItem?.kind === 'folder' &&
            dropTarget?.kind === 'before-child' &&
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
                    {isDropTarget && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
                    {renderModCard(mods)}
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

                        {/* New root folder input */}
                        {creatingFolderParentId === null && renderNewFolderInput()}

                        {/* Root-level items: folders and root mods interleaved by priority */}
                        {viewMode === 'list' ? (
                            <div className="flex flex-col gap-1.5">
                                {rootChildren.map((item) =>
                                    item.type === 'folder'
                                        ? renderFolderSection(item.folder)
                                        : renderRootMod(
                                              item.mods,
                                              rootGroupLeaders.has(item.mods[0].uid)
                                          )
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {groupChildren(rootChildren).map((group) => {
                                    if (group.type === 'folder') {
                                        return renderFolderSection(group.folder)
                                    }
                                    const leaderId = group.groups[0][0].uid
                                    const isGroupDropTarget =
                                        dragItem?.kind === 'folder' &&
                                        dropTarget?.kind === 'before-child' &&
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
                                            {isGroupDropTarget && (
                                                <div className="absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-accent pointer-events-none" />
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
