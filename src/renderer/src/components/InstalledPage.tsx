import { useState, useEffect, useCallback } from 'react'
import type { Mod, InstalledMod } from '../../../shared/types'
import { ModCard } from './ModCard'

interface Props {
    gamePath: string | null
}

export function InstalledPage({ gamePath }: Props) {
    const [installed, setInstalled] = useState<InstalledMod[]>([])
    const [modData, setModData] = useState<Map<number, Mod>>(new Map())
    const [initialized, setInitialized] = useState(false)
    const [loadingMod, setLoadingMod] = useState<number | null>(null)

    const refresh = useCallback(async () => {
        const state = await window.api.getInstalled()
        setInstalled(state.mods)
        const results = await Promise.allSettled(state.mods.map((m) => window.api.getMod(m.id)))
        const data = new Map<number, Mod>()
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') data.set(state.mods[i].id, r.value)
        })
        setModData(data)
        setInitialized(true)
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

    async function handleEnable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.enableMod(modId, gamePath)
            await refresh()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(modId: number) {
        if (!gamePath) return
        setLoadingMod(modId)
        try {
            await window.api.disableMod(modId, gamePath)
            await refresh()
        } finally {
            setLoadingMod(null)
        }
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

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {!initialized ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        Loading…
                    </div>
                ) : installed.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                        No mods installed yet
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                        {installed.map((ins) => {
                            const mod = modData.get(ins.id)
                            if (!mod) return null
                            return (
                                <ModCard
                                    key={ins.id}
                                    mod={mod}
                                    installed={ins}
                                    gamePath={gamePath}
                                    loading={loadingMod === ins.id}
                                    onInstall={() => {}}
                                    onUninstall={() => handleUninstall(ins.id)}
                                    onEnable={() => handleEnable(ins.id)}
                                    onDisable={() => handleDisable(ins.id)}
                                />
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
