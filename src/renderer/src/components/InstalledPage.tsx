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
        window.addEventListener('focus', refresh)
        return () => window.removeEventListener('focus', refresh)
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
                <div className="px-6 py-4 border-b border-border shrink-0">
                    <h1 className="text-lg font-semibold">Installed Mods</h1>
                </div>
                <div className="flex-1 flex items-center justify-center text-text-subtle text-sm">
                    No mods installed yet
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
                <h1 className="text-lg font-semibold">Installed Mods</h1>
                <span className="text-xs text-text-subtle">
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
                            className="bg-surface-raised border border-border rounded-lg px-4 py-3 flex items-center gap-4"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{mod.name}</p>
                                <p className="text-xs text-text-subtle mt-0.5">v{mod.version}</p>
                            </div>
                            <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                    mod.enabled
                                        ? 'bg-success/50 text-success-text'
                                        : 'bg-surface-hover text-text-subtle'
                                }`}
                            >
                                {mod.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    disabled={!canAct}
                                    onClick={() => handleToggle(mod)}
                                    className="text-xs px-3 py-1 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading ? '…' : mod.enabled ? 'Disable' : 'Enable'}
                                </button>
                                <button
                                    disabled={!canAct}
                                    onClick={() => handleUninstall(mod.id)}
                                    className="text-xs px-3 py-1 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
