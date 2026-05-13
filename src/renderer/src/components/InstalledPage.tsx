import { useState, useEffect, useCallback } from 'react'
import type { InstalledMod } from '../../../shared/types'

interface Props {
    gamePath: string | null
}

export function InstalledPage({ gamePath }: Props) {
    const [mods, setMods] = useState<InstalledMod[]>([])
    const [loadingMod, setLoadingMod] = useState<number | null>(null)

    const refresh = useCallback(async () => {
        const state = await window.api.getInstalled()
        setMods(state.mods)
    }, [])

    useEffect(() => {
        refresh()
    }, [refresh])

    async function handleUninstall(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.uninstallMod(modId, gamePath)
            await refresh()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleToggle(mod: InstalledMod) {
        if (!gamePath) return
        setLoadingMod(mod.id)
        try {
            if (mod.enabled) {
                await window.api.disableMod(mod.id, gamePath)
            } else {
                await window.api.enableMod(mod.id, gamePath)
            }
            await refresh()
        } finally {
            setLoadingMod(null)
        }
    }

    if (mods.length === 0) {
        return (
            <div className="h-full flex flex-col">
                <div className="px-6 py-4 border-b border-zinc-800 shrink-0">
                    <h1 className="text-lg font-semibold">Installed Mods</h1>
                </div>
                <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                    No mods installed yet
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <h1 className="text-lg font-semibold">Installed Mods</h1>
                <span className="text-xs text-zinc-500">
                    {mods.length} mod{mods.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
                {mods.map((mod) => {
                    const loading = loadingMod === mod.id
                    const canAct = !!gamePath && !loading
                    return (
                        <div
                            key={mod.id}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-center gap-4"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{mod.name}</p>
                                <p className="text-xs text-zinc-500 mt-0.5">v{mod.version}</p>
                            </div>
                            <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                    mod.enabled
                                        ? 'bg-green-900/50 text-green-400'
                                        : 'bg-zinc-800 text-zinc-500'
                                }`}
                            >
                                {mod.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    disabled={!canAct}
                                    onClick={() => handleToggle(mod)}
                                    className="text-xs px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading ? '…' : mod.enabled ? 'Disable' : 'Enable'}
                                </button>
                                <button
                                    disabled={!canAct}
                                    onClick={() => handleUninstall(mod.id)}
                                    className="text-xs px-3 py-1 rounded bg-red-900 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
