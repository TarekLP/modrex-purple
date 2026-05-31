import type { Mod, ModFile, ModLink } from '../../shared/types'
import { api } from './api'

const TTL_MS = 5 * 60 * 1000
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000
const STORAGE_KEY = 'modrex:mod-cache'

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

function loadFromStorage(): void {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const stored = JSON.parse(raw) as Record<string, ModCacheEntry>
        const now = Date.now()
        for (const [key, entry] of Object.entries(stored)) {
            if (now - entry.fetchedAt < STORAGE_TTL_MS) {
                modCache.set(Number(key), entry)
            }
        }
    } catch {
        // Corrupted storage or unavailable — start fresh
    }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleStorage(): void {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        try {
            const obj: Record<string, ModCacheEntry> = {}
            for (const [id, entry] of modCache) {
                obj[String(id)] = entry
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
        } catch {
            // Quota exceeded or unavailable — ignore
        }
    }, 2000)
}

loadFromStorage()

export function getModCacheEntry(id: number): ModCacheEntry | undefined {
    return modCache.get(id)
}

export async function getCachedMod(id: number): Promise<Mod> {
    const entry = modCache.get(id)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.mod
    const mod = await api.getMod(id)
    modCache.set(id, { mod, fetchedAt: Date.now() })
    scheduleStorage()
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
