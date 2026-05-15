import type { Mod } from '../../shared/types'

const cache = new Map<number, Mod>()

export async function getCachedMod(id: number): Promise<Mod> {
    if (cache.has(id)) return cache.get(id)!
    const mod = await window.api.getMod(id)
    cache.set(id, mod)
    return mod
}
