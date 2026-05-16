import type { Mod } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000

interface CacheEntry {
    mod: Mod
    fetchedAt: number
}

const cache = new Map<number, CacheEntry>()

export async function getCachedMod(id: number): Promise<Mod> {
    const entry = cache.get(id)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.mod
    const mod = await window.api.getMod(id)
    cache.set(id, { mod, fetchedAt: Date.now() })
    return mod
}
