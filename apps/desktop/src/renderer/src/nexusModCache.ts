import type { Mod, ModFile } from '../../shared/types'
import { api } from './api'
import { waitForForegroundClear } from './requestPriority'

// Deliberately separate from modCache.ts's cache, not merged into it: Nexus mod ids are
// only unique within a game domain (they repeat across games, same as the nxm progress-id
// convention in NexusBrowsePage) and can also collide numerically with a modworkshop id.
// Keying by gameId:modId avoids both. Session-only, no localStorage persistence. This
// only backs the detail page today, not a bulk refresh path like installedMetaCache.
const TTL_MS = 5 * 60 * 1000

interface NexusModCacheEntry {
    mod: Mod
    fetchedAt: number
}

const cache = new Map<string, NexusModCacheEntry>()

function key(gameId: string, modId: number): string {
    return `${gameId}:${modId}`
}

export function getNexusModCacheEntry(
    gameId: string,
    modId: number
): NexusModCacheEntry | undefined {
    return cache.get(key(gameId, modId))
}

export async function getCachedNexusMod(gameId: string, modId: number): Promise<Mod> {
    const k = key(gameId, modId)
    const entry = cache.get(k)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.mod
    const mod = await api.nexusGetModDetail(gameId, modId)
    cache.set(k, { mod, fetchedAt: Date.now() })
    return mod
}

interface NexusFilesCacheEntry {
    files: ModFile[]
    fetchedAt: number
}

const filesCache = new Map<string, NexusFilesCacheEntry>()

export function getNexusFilesCacheEntry(
    gameId: string,
    modId: number
): NexusFilesCacheEntry | undefined {
    return filesCache.get(key(gameId, modId))
}

export async function getCachedNexusModFiles(gameId: string, modId: number): Promise<ModFile[]> {
    const k = key(gameId, modId)
    const entry = filesCache.get(k)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.files
    const { data } = await api.nexusListModFiles(gameId, modId)
    filesCache.set(k, { files: data, fetchedAt: Date.now() })
    return data
}

// Backs useModData's update check for installed Nexus mods. Kept separate from the
// cache above (same underlying endpoint, deliberately different TTL): that cache is
// tuned for a user actively looking at one mod's detail page, this one is a silent
// background poll across potentially every installed Nexus mod, so it uses the same
// long TTL as modworkshop's own installedMetaCache (modCache.ts) to stay in lockstep
// with useModData's staleness check.
interface NexusInstalledMetaEntry {
    mod: Mod
    fetchedAt: number
}

const installedMetaCache = new Map<string, NexusInstalledMetaEntry>()

export function getNexusInstalledMetaEntry(
    gameId: string,
    modId: number
): NexusInstalledMetaEntry | undefined {
    return installedMetaCache.get(key(gameId, modId))
}

// Nexus has no batch metadata endpoint (unlike modworkshop's ids[] listing filter), so
// refreshing several installed mods costs one real request per mod against an
// undocumented hourly quota (see nexus.rs). Sequenced one at a time with a stagger
// between requests, on top of waitForForegroundClear, so a large installed list never
// bursts a run of Nexus calls back to back.
const STAGGER_MS = 2000

// onResult fires after each mod resolves, not just once the whole trickle finishes,
// with a real stagger between requests a caller waiting on the returned promise alone
// would see nothing update for as long as the whole list takes.
export async function fetchInstalledNexusModsMeta(
    gameId: string,
    modIds: number[],
    onResult?: (modId: number, mod: Mod | null) => void
): Promise<{ mods: Map<number, Mod>; failedIds: number[] }> {
    const mods = new Map<number, Mod>()
    const failedIds: number[] = []
    for (let i = 0; i < modIds.length; i++) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, STAGGER_MS))
        await waitForForegroundClear()
        const modId = modIds[i]
        try {
            const mod = await api.nexusGetModDetail(gameId, modId)
            installedMetaCache.set(key(gameId, modId), { mod, fetchedAt: Date.now() })
            mods.set(modId, mod)
            onResult?.(modId, mod)
        } catch {
            failedIds.push(modId)
            onResult?.(modId, null)
        }
    }
    return { mods, failedIds }
}
