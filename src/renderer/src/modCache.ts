import type { Mod, ModFile, ModLink } from '../../shared/types'
import { api } from './api'

const TTL_MS = 5 * 60 * 1000

interface ModCacheEntry {
    mod: Mod
    fetchedAt: number
}

interface FilesCacheEntry {
    files: ModFile[]
    fetchedAt: number
}

interface LinksCacheEntry {
    links: ModLink[]
    fetchedAt: number
}

const modCache = new Map<number, ModCacheEntry>()
const filesCache = new Map<number, FilesCacheEntry>()
const linksCache = new Map<number, LinksCacheEntry>()

export async function getCachedMod(id: number): Promise<Mod> {
    const entry = modCache.get(id)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.mod
    const mod = await api.getMod(id)
    modCache.set(id, { mod, fetchedAt: Date.now() })
    return mod
}

export async function getCachedModFiles(id: number): Promise<ModFile[]> {
    const entry = filesCache.get(id)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.files
    const { data } = await api.listModFiles(id)
    filesCache.set(id, { files: data, fetchedAt: Date.now() })
    return data
}

export async function getCachedModLinks(id: number): Promise<ModLink[]> {
    const entry = linksCache.get(id)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.links
    const { data } = await api.listModLinks(id)
    linksCache.set(id, { links: data, fetchedAt: Date.now() })
    return data
}
