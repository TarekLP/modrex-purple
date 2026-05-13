import { useState, useEffect, useCallback } from 'react'
import type { Mod, Paginated, InstalledMod } from '../../../shared/types'
import { ModCard } from './ModCard'

interface Props {
    gamePath: string | null
}

export function BrowsePage({ gamePath }: Props) {
    const [page, setPage] = useState(1)
    const [result, setResult] = useState<Paginated<Mod> | null>(null)
    const [installed, setInstalled] = useState<InstalledMod[]>([])
    const [loadingMod, setLoadingMod] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const fetchMods = useCallback(async (p: number) => {
        setError(null)
        try {
            const data = await window.api.listMods({ page: p, limit: 24, sort: 'downloads' })
            setResult(data)
        } catch (e) {
            setError(String(e))
        }
    }, [])

    const refreshInstalled = useCallback(async () => {
        const state = await window.api.getInstalled()
        setInstalled(state.mods)
    }, [])

    useEffect(() => {
        fetchMods(page)
    }, [fetchMods, page])

    useEffect(() => {
        refreshInstalled()
    }, [refreshInstalled])

    async function handleInstall(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.installMod(modId, gamePath)
            await refreshInstalled()
        } catch (e) {
            setError(String(e))
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUninstall(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.uninstallMod(modId, gamePath)
            await refreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.enableMod(modId, gamePath)
            await refreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.disableMod(modId, gamePath)
            await refreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <h1 className="text-lg font-semibold">Browse Mods</h1>
                {!gamePath && (
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded">
                        Game not found — install disabled
                    </span>
                )}
            </div>

            {error && (
                <div className="mx-6 mt-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">
                    {error}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {!result ? (
                    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                        Loading…
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                        {result.data.map((mod) => (
                            <ModCard
                                key={mod.id}
                                mod={mod}
                                installed={installed.find((m) => m.id === mod.id)}
                                gamePath={gamePath}
                                loading={loadingMod === mod.id}
                                onInstall={() => handleInstall(mod.id)}
                                onUninstall={() => handleUninstall(mod.id)}
                                onEnable={() => handleEnable(mod.id)}
                                onDisable={() => handleDisable(mod.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {result && (
                <div className="px-6 py-3 border-t border-zinc-800 flex items-center justify-between shrink-0">
                    <span className="text-xs text-zinc-500">
                        Page {result.meta.current_page} of {result.meta.last_page}
                    </span>
                    <div className="flex gap-2">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Previous
                        </button>
                        <button
                            disabled={page >= result.meta.last_page}
                            onClick={() => setPage((p) => p + 1)}
                            className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
