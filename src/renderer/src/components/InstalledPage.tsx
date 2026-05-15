import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import type { Mod, InstalledMod } from '../../../shared/types'
import { ModCard } from './ModCard'

interface Props {
    gamePath: string | null
    installed: InstalledMod[]
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

export function InstalledPage({ gamePath, installed, onRefreshInstalled, onOpenDetail }: Props) {
    const [modData, setModData] = useState<Map<number, Mod>>(new Map())
    const [failedIds, setFailedIds] = useState<Set<number>>(new Set())
    const fetchedIds = useRef<Set<number>>(new Set())
    const [initialized, setInitialized] = useState(false)
    const [loadingMod, setLoadingMod] = useState<number | null>(null)
    const [updatingAll, setUpdatingAll] = useState(false)
    const [showUpdates, setShowUpdates] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

    const refresh = useCallback(async () => {
        await onRefreshInstalled()
        setInitialized(true)
    }, [onRefreshInstalled])

    useEffect(() => {
        refresh()
    }, [refresh])

    // Fetch modData for any newly seen mod IDs
    useEffect(() => {
        const missing = installed.filter((m) => !fetchedIds.current.has(m.id))
        if (missing.length === 0) return

        Promise.allSettled(missing.map((m) => window.api.getMod(m.id))).then((results) => {
            const updates: [number, Mod][] = []
            const failed: number[] = []
            results.forEach((r, i) => {
                fetchedIds.current.add(missing[i].id)
                if (r.status === 'fulfilled') {
                    updates.push([missing[i].id, r.value])
                } else {
                    failed.push(missing[i].id)
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
                <h1 className="text-lg font-semibold">Installed Mods</h1>
                {installed.length > 0 && (
                    <span className="text-xs text-text-subtle">
                        {installed.length} mod{installed.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6">
                {!initialized ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        Loading…
                    </div>
                ) : installed.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        No mods installed yet
                    </div>
                ) : (
                    <>
                        {updatable.length > 0 && (
                            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-accent/10 border border-accent/30">
                                <span className="text-sm font-medium text-accent">
                                    {updatable.length} mod{updatable.length !== 1 ? 's' : ''} can be
                                    updated
                                </span>
                                <button
                                    onClick={() => {
                                        setSelectedIds(new Set(updatable.map((m) => m.id)))
                                        setShowUpdates(true)
                                    }}
                                    className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright transition-colors"
                                >
                                    Review updates
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                            {installed.map((ins) => {
                                const apiMod = modData.get(ins.id)
                                if (!apiMod && !failedIds.has(ins.id)) return null
                                const mod = apiMod ?? syntheticMod(ins)
                                return (
                                    <ModCard
                                        key={ins.id}
                                        mod={mod}
                                        installed={ins}
                                        gamePath={gamePath}
                                        loading={loadingMod === ins.id}
                                        onOpen={apiMod ? () => onOpenDetail(ins.id) : () => {}}
                                        onInstall={() => {}}
                                        onUninstall={() => handleUninstall(ins.id)}
                                        onEnable={() => handleEnable(ins.id)}
                                        onDisable={() => handleDisable(ins.id)}
                                    />
                                )
                            })}
                        </div>
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
                                Available updates ({updatable.length})
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
                                            {loadingMod === ins.id ? 'Updating…' : 'Update'}
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
                                Close
                            </button>
                            <button
                                disabled={!gamePath || updatingAll || selectedIds.size === 0}
                                onClick={handleUpdateSelected}
                                className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {updatingAll
                                    ? 'Updating…'
                                    : `Update Selected (${selectedIds.size})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
