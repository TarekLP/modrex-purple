import { api } from '../api'
import { getCachedMod } from '../modCache'
import { collectDeps, missingRequiredDeps, ue4ssLoaderIdsFor, offsiteDepHost } from '../deps'
import type { GameId, InstalledMod } from '../../../shared/types'

export interface MissingDepRef {
    id: number | null // null = offsite (SuperBLT etc.), no modworkshop page to navigate to
    name: string
}

export interface HealthItem {
    id: number
    uid: string
    name: string
    missingDeps?: MissingDepRef[]
}

async function checkLoaders(
    gamePath: string,
    gameId: GameId
): Promise<{ bltOk: boolean | null; loaderModIds: Record<number, boolean | null> }> {
    if (gameId === 'pd2') {
        return { bltOk: await api.checkSuperblt(gamePath), loaderModIds: {} }
    }
    if (gameId === 'pdth') {
        const [bltOk, pdthOk, dahmOk] = await Promise.all([
            api.checkSuperblt(gamePath),
            api.checkPdthOverrides(gamePath),
            api.checkDahm(gamePath),
        ])
        return { bltOk, loaderModIds: { 53474: pdthOk, 14267: dahmOk } }
    }
    const ue4ssOk = await api.checkUe4ss(gamePath, gameId)
    return {
        bltOk: null,
        loaderModIds: Object.fromEntries(ue4ssLoaderIdsFor(gameId).map((id) => [id, ue4ssOk])),
    }
}

// Same per-mod dependency check ModDetailPage runs at install time, run retroactively
// across the whole pack. Each id costs a getCachedMod fetch — call explicitly, never ambiently.
export async function checkMissingDependencies(
    installed: InstalledMod[],
    positiveIds: number[],
    gamePath: string,
    gameId: GameId
): Promise<HealthItem[]> {
    if (positiveIds.length === 0) return []
    const { bltOk, loaderModIds } = await checkLoaders(gamePath, gameId)
    const results = await Promise.all(
        positiveIds.map(async (id): Promise<HealthItem | null> => {
            try {
                const mod = await getCachedMod(id)
                const allDeps = collectDeps(mod)
                const missing = missingRequiredDeps(allDeps, installed, bltOk, loaderModIds)
                if (missing.length === 0) return null
                const missingDeps: MissingDepRef[] = missing.map((d) => ({
                    id: d.mod?.id ?? null,
                    name: d.mod?.name ?? d.name ?? (d.url ? offsiteDepHost(d.url) : ''),
                }))
                return { id: mod.id, uid: `dep:${mod.id}`, name: mod.name, missingDeps }
            } catch {
                return null
            }
        })
    )
    return results.filter((r): r is HealthItem => r !== null)
}
