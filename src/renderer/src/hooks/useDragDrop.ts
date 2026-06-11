import { useState, useRef } from 'react'
import type { DragEvent } from 'react'
import type { GameId, Mod, InstalledMod, ModFolder, TopLevelItem } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { computeChildren, syntheticMod } from './installedUtils'
import { api } from '../api'

export type DragItem = { kind: 'mod'; uid: string } | { kind: 'folder'; id: string }

export type DropTarget =
    | { kind: 'before-mod'; uid: string }
    | { kind: 'after-mod'; uid: string }
    | { kind: 'into-folder'; folderId: string }
    | { kind: 'before-child'; id: string; itemType: 'folder' | 'mod'; parentId: string | null }
    | { kind: 'after-child'; id: string; itemType: 'folder' | 'mod'; parentId: string | null }
    | null

interface Options {
    installed: InstalledMod[]
    folders: ModFolder[]
    gamePath: string | null
    modData: Map<number, Mod>
    onRefreshInstalled: () => Promise<void>
    activeGame?: GameId
}

export function useDragDrop({
    installed,
    folders,
    gamePath,
    modData,
    onRefreshInstalled,
    activeGame,
}: Options) {
    const [dragItem, setDragItem] = useState<DragItem | null>(null)
    const dragItemRef = useRef<DragItem | null>(null)
    const [dropTarget, setDropTarget] = useState<DropTarget>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const dragScrollFrame = useRef<number | null>(null)
    const dragScrollDir = useRef<'up' | 'down' | null>(null)
    const dragClientY = useRef<number>(0)

    function createDragImage(e: DragEvent, mod: Mod) {
        const el = document.createElement('div')
        el.style.cssText =
            'position:fixed;top:-9999px;left:-9999px;display:flex;flex-direction:column;' +
            'background:var(--color-surface-raised);border:1px solid var(--color-border);border-radius:8px;' +
            'box-shadow:0 4px 16px rgba(0,0,0,0.6);width:160px;overflow:hidden;pointer-events:none;'
        if (mod.thumbnail) {
            const img = document.createElement('img')
            img.src = `${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`
            img.style.cssText = 'width:160px;height:90px;object-fit:cover;display:block;'
            el.appendChild(img)
        } else {
            const placeholder = document.createElement('div')
            placeholder.style.cssText =
                'width:160px;height:90px;background:var(--color-surface-hover);'
            el.appendChild(placeholder)
        }
        const name = document.createElement('span')
        name.textContent = mod.name
        name.style.cssText =
            'font-size:12px;color:var(--color-text);padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
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

    function handleContainerDragOver(e: DragEvent) {
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
        dragItemRef.current = null
        setDragItem(null)
        setDropTarget(null)
        stopAutoScroll()
        dragScrollDir.current = null
    }

    function onModDragStart(e: DragEvent, uid: string) {
        const ins = installed.find((m) => m.uid === uid)!
        const mod = modData.get(ins.id) ?? syntheticMod(ins)
        const item: DragItem = { kind: 'mod', uid }
        dragItemRef.current = item
        setDragItem(item)
        createDragImage(e, mod)
    }

    function onModDragOver(e: DragEvent, uid: string) {
        if (!dragItem || dragItem.kind === 'folder') return
        if (dragItem.uid === uid) return

        const srcMod = installed.find((m) => m.uid === dragItem.uid)
        const targetMod = installed.find((m) => m.uid === uid)
        if (!srcMod || !targetMod) return

        // Secondary-target mods (e.g. mod_overrides) can only reorder within their own scope.
        if (srcMod.location && (srcMod.folderId ?? null) !== (targetMod.folderId ?? null)) return

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const isTop = e.clientY - rect.top < rect.height / 2

        if ((srcMod.folderId ?? null) === (targetMod.folderId ?? null)) {
            const srcFolderId = srcMod.folderId ?? null
            const scopedMods = installed
                .filter((m) => (m.folderId ?? null) === srcFolderId)
                .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            const srcGroupSize = scopedMods.filter((m) => m.id === srcMod.id).length
            const srcOrigIdx = scopedMods.findIndex((m) => m.uid === srcMod.uid)
            const noOpNeighbor = isTop
                ? scopedMods[srcOrigIdx + srcGroupSize]
                : srcOrigIdx > 0
                  ? scopedMods[srcOrigIdx - 1]
                  : undefined
            if (noOpNeighbor?.id === targetMod.id) return
        }

        e.preventDefault()
        setDropTarget(isTop ? { kind: 'before-mod', uid } : { kind: 'after-mod', uid })
    }

    function onFolderHeaderDragOver(e: DragEvent, folder: ModFolder) {
        if (!dragItem) return
        e.preventDefault()
        if (dragItem.kind === 'mod') {
            const srcMod = installed.find((m) => m.uid === dragItem.uid)
            if (srcMod?.location) return
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

    function onChildModDragOver(e: DragEvent, uid: string, parentId: string | null) {
        if (!dragItem || dragItem.kind !== 'folder') return
        e.preventDefault()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const isBottom = e.clientY - rect.top > rect.height / 2
        setDropTarget(
            isBottom
                ? { kind: 'after-child', id: uid, itemType: 'mod', parentId }
                : { kind: 'before-child', id: uid, itemType: 'mod', parentId }
        )
    }

    function handleGapDragOver(e: DragEvent, uid: string, isBefore: boolean) {
        const item = dragItemRef.current
        if (!item || item.kind !== 'mod') return
        if (item.uid === uid) return
        const srcMod = installed.find((m) => m.uid === item.uid)
        const targetMod = installed.find((m) => m.uid === uid)
        if (!srcMod || !targetMod) return
        if ((srcMod.folderId ?? null) === (targetMod.folderId ?? null)) {
            const scopedMods = installed
                .filter((m) => (m.folderId ?? null) === (srcMod.folderId ?? null))
                .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            const srcGroupSize = scopedMods.filter((m) => m.id === srcMod.id).length
            const srcOrigIdx = scopedMods.findIndex((m) => m.uid === srcMod.uid)
            if (isBefore) {
                if (scopedMods[srcOrigIdx + srcGroupSize]?.id === targetMod.id) return
            } else {
                if (srcOrigIdx > 0 && scopedMods[srcOrigIdx - 1]?.id === targetMod.id) return
            }
        }
        e.preventDefault()
        setDropTarget(isBefore ? { kind: 'before-mod', uid } : { kind: 'after-mod', uid })
    }

    async function onModDropDirect(targetRepUid: string, isBefore: boolean) {
        if (!dragItem || dragItem.kind !== 'mod' || !gamePath) return
        const srcRepUid = dragItem.uid
        dragItemRef.current = null
        setDragItem(null)
        setDropTarget(null)
        if (targetRepUid === srcRepUid) return

        const srcMod = installed.find((m) => m.uid === srcRepUid)!
        const targetMod = installed.find((m) => m.uid === targetRepUid)!
        const srcFolderId = srcMod.folderId ?? null
        const targetFolderId = targetMod.folderId ?? null
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
            await api.reorderModsInFolder(
                srcFolderId,
                reordered.map((m) => m.uid),
                gamePath,
                activeGame
            )
        } else if (!srcMod.location) {
            const targetScopeMods = installed
                .filter((m) => (m.folderId ?? null) === targetFolderId && m.id !== srcMod.id)
                .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            const toIdx = targetScopeMods.findIndex((m) => m.uid === targetRepUid)
            const targetPosition = isBefore ? toIdx : toIdx + 1
            for (const m of srcGroupMods) {
                await api.moveModToFolder(
                    m.uid,
                    targetFolderId,
                    targetPosition,
                    gamePath,
                    activeGame
                )
            }
        }
        await onRefreshInstalled()
    }

    async function onModDrop(targetRepUid: string) {
        if (!dragItem || dragItem.kind !== 'mod' || !gamePath) return
        const srcRepUid = dragItem.uid
        dragItemRef.current = null
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
            await api.reorderModsInFolder(
                srcFolderId,
                reordered.map((m) => m.uid),
                gamePath,
                activeGame
            )
        } else if (!srcMod.location) {
            const targetScopeMods = installed
                .filter((m) => (m.folderId ?? null) === targetFolderId && m.id !== srcMod.id)
                .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            const toIdx = targetScopeMods.findIndex((m) => m.uid === targetRepUid)
            const targetPosition = isBefore ? toIdx : toIdx + 1
            for (const m of srcGroupMods) {
                await api.moveModToFolder(
                    m.uid,
                    targetFolderId,
                    targetPosition,
                    gamePath,
                    activeGame
                )
            }
        }
        await onRefreshInstalled()
    }

    async function onDropIntoFolder(folderId: string) {
        if (!dragItem || dragItem.kind !== 'mod' || !gamePath) return
        const srcRepUid = dragItem.uid
        dragItemRef.current = null
        setDragItem(null)
        setDropTarget(null)
        const srcMod = installed.find((m) => m.uid === srcRepUid)!
        if ((srcMod.folderId ?? null) === folderId) return
        if (srcMod.location) return
        const srcGroupMods = installed.filter(
            (m) => (m.folderId ?? null) === (srcMod.folderId ?? null) && m.id === srcMod.id
        )
        const folderMods = installed.filter((m) => m.folderId === folderId)
        for (const m of srcGroupMods) {
            await api.moveModToFolder(m.uid, folderId, folderMods.length, gamePath, activeGame)
        }
        await onRefreshInstalled()
    }

    function onEmptyFolderDragOver(e: DragEvent, folderId: string) {
        if (!dragItem || dragItem.kind !== 'mod') return
        const srcMod = installed.find((m) => m.uid === dragItem.uid)
        if (srcMod?.location) return
        e.preventDefault()
        setDropTarget({ kind: 'into-folder', folderId })
    }

    function onFolderDragStart(e: DragEvent, folderId: string) {
        e.dataTransfer.effectAllowed = 'move'
        const item: DragItem = { kind: 'folder', id: folderId }
        dragItemRef.current = item
        setDragItem(item)
    }

    async function onChildDrop(
        srcFolderId: string,
        targetId: string,
        targetItemType: 'folder' | 'mod',
        parentId: string | null
    ) {
        if (!gamePath) return
        dragItemRef.current = null
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
        const insertPos = dropTarget?.kind === 'after-child' ? insertIdx + 1 : insertIdx
        items.splice(insertPos, 0, { type: 'folder', id: srcFolderId })

        const draggedFolder = folders.find((f) => f.id === srcFolderId)
        if (draggedFolder && draggedFolder.parentId !== parentId) {
            await api.moveFolder(srcFolderId, parentId, gamePath, activeGame)
        }
        await api.reorderChildren(parentId, items, gamePath, activeGame)
        await onRefreshInstalled()
    }

    async function onNestFolderInto(srcFolderId: string, targetFolderId: string) {
        if (!gamePath || srcFolderId === targetFolderId) return
        dragItemRef.current = null
        setDragItem(null)
        setDropTarget(null)
        await api.moveFolder(srcFolderId, targetFolderId, gamePath, activeGame)
        await onRefreshInstalled()
    }

    return {
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
    }
}
