import { useState, useEffect, useRef } from 'react'
import { X, LayoutGrid, List, FolderOpen } from 'lucide-react'
import { t } from '../i18n'
import type { Mod, InstalledMod } from '../../../shared/types'
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

export function InstalledPage({
    gamePath,
    installed,
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
    const [localOrder, setLocalOrder] = useState<number[]>([])
    const [draggedId, setDraggedId] = useState<number | null>(null)
    const [dragOverId, setDragOverId] = useState<number | null>(null)
    const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const dragScrollFrame = useRef<number | null>(null)
    const dragScrollDir = useRef<'up' | 'down' | null>(null)
    const dragClientY = useRef<number>(0)

    function setView(mode: ViewMode) {
        setViewMode(mode)
        localStorage.setItem('pd3mm:installed-view', mode)
    }

    useEffect(() => {
        setLocalOrder(
            [...installed].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map((m) => m.id)
        )
    }, [installed])

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

    function handleDragOver(id: number, e: React.DragEvent) {
        e.preventDefault()
        if (dragOverId !== id) setDragOverId(id)
    }

    function handleGridDragOver(id: number, e: React.DragEvent) {
        e.preventDefault()
        if (dragOverId !== id) setDragOverId(id)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const pos: 'before' | 'after' = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
        if (dragOverPos !== pos) setDragOverPos(pos)
    }

    async function handleDrop(targetId: number) {
        if (!draggedId || !gamePath) return
        const srcId = draggedId
        setDraggedId(null)
        setDragOverId(null)
        if (targetId === srcId) return
        const newOrder = [...localOrder]
        const from = newOrder.indexOf(srcId)
        const to = newOrder.indexOf(targetId)
        newOrder.splice(from, 1)
        newOrder.splice(to, 0, srcId)
        setLocalOrder(newOrder)
        await window.api.reorderMods(newOrder, gamePath)
        await onRefreshInstalled()
    }

    async function handleGridDrop(targetId: number, e: React.DragEvent) {
        e.preventDefault()
        if (!draggedId || !gamePath) return
        const srcId = draggedId
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const pos: 'before' | 'after' = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
        setDraggedId(null)
        setDragOverId(null)
        setDragOverPos(null)
        if (targetId === srcId) return
        const newOrder = [...localOrder]
        const from = newOrder.indexOf(srcId)
        newOrder.splice(from, 1)
        const to = newOrder.indexOf(targetId)
        newOrder.splice(pos === 'before' ? to : to + 1, 0, srcId)
        setLocalOrder(newOrder)
        await window.api.reorderMods(newOrder, gamePath)
        await onRefreshInstalled()
    }

    function handleDragEnd() {
        setDraggedId(null)
        setDragOverId(null)
        setDragOverPos(null)
        stopAutoScroll()
        dragScrollDir.current = null
    }

    // Fetch modData for newly seen mod IDs and re-fetch expired cache entries
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
                    <div className="flex items-center gap-1 bg-surface-hover rounded p-0.5">
                        <button
                            onClick={() => setView('grid')}
                            title="Grid view"
                            className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-surface-active text-text' : 'text-text-subtle hover:text-text'}`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setView('list')}
                            title="List view"
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
                className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6"
            >
                {!installedReady ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        {t('common.loading')}
                    </div>
                ) : installed.length === 0 ? (
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

                        {(() => {
                            const installedMap = new Map(installed.map((m) => [m.id, m]))
                            const draggedIdx = localOrder.indexOf(draggedId ?? -1)
                            return viewMode === 'grid' ? (
                                <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                                    {localOrder.flatMap((id) => {
                                        const ins = installedMap.get(id)
                                        if (!ins) return []
                                        const apiMod = modData.get(id)
                                        if (!apiMod && !failedIds.has(id)) return []
                                        const mod = apiMod ?? syntheticMod(ins)
                                        const isOver = dragOverId === id && draggedId !== id
                                        return [
                                            <div
                                                key={id}
                                                draggable
                                                onDragStart={() => setDraggedId(id)}
                                                onDragOver={(e) => handleGridDragOver(id, e)}
                                                onDrop={(e) => handleGridDrop(id, e)}
                                                onDragEnd={handleDragEnd}
                                                className={`relative h-full rounded-lg cursor-grab active:cursor-grabbing transition-opacity ${
                                                    draggedId === id ? 'opacity-40' : 'opacity-100'
                                                }`}
                                            >
                                                {isOver && dragOverPos && (
                                                    <div
                                                        className={`absolute top-0 bottom-0 w-1 bg-accent z-10 pointer-events-none ${
                                                            dragOverPos === 'before'
                                                                ? 'left-0 rounded-l-lg'
                                                                : 'right-0 rounded-r-lg'
                                                        }`}
                                                    />
                                                )}
                                                <ModCard
                                                    mod={mod}
                                                    installed={ins}
                                                    gamePath={gamePath}
                                                    loading={loadingMod === id}
                                                    onOpen={
                                                        apiMod ? () => onOpenDetail(id) : () => {}
                                                    }
                                                    onInstall={() => {}}
                                                    onUninstall={() => handleUninstall(id)}
                                                    onEnable={() => handleEnable(id)}
                                                    onDisable={() => handleDisable(id)}
                                                />
                                            </div>,
                                        ]
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {localOrder.flatMap((id) => {
                                        const ins = installedMap.get(id)
                                        if (!ins) return []
                                        const apiMod = modData.get(id)
                                        if (!apiMod && !failedIds.has(id)) return []
                                        const mod = apiMod ?? syntheticMod(ins)
                                        const isOver = dragOverId === id && draggedId !== id
                                        const thisIdx = localOrder.indexOf(id)
                                        const insertBefore = isOver && draggedIdx > thisIdx
                                        const insertAfter = isOver && draggedIdx < thisIdx
                                        return [
                                            insertBefore && (
                                                <div
                                                    key={`line-${id}`}
                                                    className="h-0.5 rounded-full bg-accent mx-2"
                                                />
                                            ),
                                            <ModListRow
                                                key={id}
                                                mod={mod}
                                                installed={ins}
                                                gamePath={gamePath}
                                                loading={loadingMod === id}
                                                isDragging={draggedId === id}
                                                onOpen={apiMod ? () => onOpenDetail(id) : () => {}}
                                                onUninstall={() => handleUninstall(id)}
                                                onEnable={() => handleEnable(id)}
                                                onDisable={() => handleDisable(id)}
                                                onDragStart={() => setDraggedId(id)}
                                                onDragOver={(e) => handleDragOver(id, e)}
                                                onDrop={() => handleDrop(id)}
                                                onDragEnd={handleDragEnd}
                                            />,
                                            insertAfter && (
                                                <div
                                                    key={`line-${id}`}
                                                    className="h-0.5 rounded-full bg-accent mx-2"
                                                />
                                            ),
                                        ].filter(Boolean)
                                    })}
                                </div>
                            )
                        })()}
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
