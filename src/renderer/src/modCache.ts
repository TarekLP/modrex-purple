import type { Mod, ModFile, ModLink } from '../../shared/types'
import { api } from './api'
import { waitForForegroundClear } from './requestPriority'

const TTL_MS = 5 * 60 * 1000
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000
const MOD_STORAGE_KEY = 'modrex:mod-cache'
const FILES_STORAGE_KEY = 'modrex:files-cache'
const LINKS_STORAGE_KEY = 'modrex:links-cache'
const INSTALLED_META_STORAGE_KEY = 'modrex:installed-meta-cache'
const INSTALLED_META_CHUNK_SIZE = 50

const CACHE_STORAGE_KEYS = [
    MOD_STORAGE_KEY,
    FILES_STORAGE_KEY,
    LINKS_STORAGE_KEY,
    INSTALLED_META_STORAGE_KEY,
]

// Freshness window for bulk installed-mod metadata (see fetchInstalledModsMeta).
// Exported so useModData's own staleness check stays in lockstep with what
// this cache actually serves. Longer than the 5-min mod/files/links TTL above
// on purpose: name/version/thumbnail rarely change minute-to-minute, and a
// short window was re-triggering a full batch refresh on every game switch
// once it lapsed.
export const INSTALLED_META_TTL_MS = 30 * 60 * 1000

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

// Deliberately separate from ModCacheEntry: entries here come from the
// `ids[]` listing filter, which lacks images/dependencies/changelog/full
// banner. ModDetailPage seeds from getModCacheEntry and treats a hit as
// complete, so a thin entry must never be visible through that lookup.
interface InstalledMetaCacheEntry {
    mod: Mod
    fetchedAt: number
}

const modCache = new Map<number, ModCacheEntry>()
const filesCache = new Map<number, FilesCacheEntry>()
const linksCache = new Map<number, LinksCacheEntry>()
const installedMetaCache = new Map<number, InstalledMetaCacheEntry>()

function loadFromStorage(): void {
    const now = Date.now()
    try {
        const raw = localStorage.getItem(MOD_STORAGE_KEY)
        if (raw) {
            const stored = JSON.parse(raw) as Record<string, ModCacheEntry>
            for (const [key, entry] of Object.entries(stored)) {
                if (now - entry.fetchedAt < STORAGE_TTL_MS) {
                    modCache.set(Number(key), entry)
                }
            }
        }
    } catch {
        // Corrupted storage or unavailable — start fresh
    }
    try {
        const raw = localStorage.getItem(FILES_STORAGE_KEY)
        if (raw) {
            const stored = JSON.parse(raw) as Record<string, FilesCacheEntry>
            for (const [key, entry] of Object.entries(stored)) {
                if (now - entry.fetchedAt < STORAGE_TTL_MS) {
                    filesCache.set(Number(key), entry)
                }
            }
        }
    } catch {
        // Corrupted storage or unavailable — start fresh
    }
    try {
        const raw = localStorage.getItem(LINKS_STORAGE_KEY)
        if (raw) {
            const stored = JSON.parse(raw) as Record<string, LinksCacheEntry>
            for (const [key, entry] of Object.entries(stored)) {
                if (now - entry.fetchedAt < STORAGE_TTL_MS) {
                    linksCache.set(Number(key), entry)
                }
            }
        }
    } catch {
        // Corrupted storage or unavailable — start fresh
    }
    try {
        const raw = localStorage.getItem(INSTALLED_META_STORAGE_KEY)
        if (raw) {
            const stored = JSON.parse(raw) as Record<string, InstalledMetaCacheEntry>
            for (const [key, entry] of Object.entries(stored)) {
                if (now - entry.fetchedAt < STORAGE_TTL_MS) {
                    installedMetaCache.set(Number(key), entry)
                }
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
            const mods: Record<string, ModCacheEntry> = {}
            for (const [id, entry] of modCache) mods[String(id)] = entry
            localStorage.setItem(MOD_STORAGE_KEY, JSON.stringify(mods))
        } catch {
            // Quota exceeded or unavailable — ignore
        }
        try {
            const files: Record<string, FilesCacheEntry> = {}
            for (const [id, entry] of filesCache) files[String(id)] = entry
            localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(files))
        } catch {
            // Quota exceeded or unavailable — ignore
        }
        try {
            const links: Record<string, LinksCacheEntry> = {}
            for (const [id, entry] of linksCache) links[String(id)] = entry
            localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links))
        } catch {
            // Quota exceeded or unavailable — ignore
        }
        try {
            const installedMeta: Record<string, InstalledMetaCacheEntry> = {}
            for (const [id, entry] of installedMetaCache) installedMeta[String(id)] = entry
            localStorage.setItem(INSTALLED_META_STORAGE_KEY, JSON.stringify(installedMeta))
        } catch {
            // Quota exceeded or unavailable — ignore
        }
    }, 2000)
}

loadFromStorage()

export function getModCacheEntry(id: number): ModCacheEntry | undefined {
    return modCache.get(id)
}

export function getFilesCacheEntry(id: number): FilesCacheEntry | undefined {
    return filesCache.get(id)
}

export function getLinksCacheEntry(id: number): LinksCacheEntry | undefined {
    return linksCache.get(id)
}

export function getInstalledMetaEntry(id: number): InstalledMetaCacheEntry | undefined {
    return installedMetaCache.get(id)
}

// Byte estimate of the persisted mod/files/links/installed-meta caches. Rust
// can't see localStorage, so the Settings storage view sizes this side here.
export function getModCacheSize(): number {
    let total = 0
    for (const key of CACHE_STORAGE_KEYS) {
        total += localStorage.getItem(key)?.length ?? 0
    }
    return total
}

// Wipes the in-memory maps and their persisted copies, returning the bytes
// freed. Cancels the pending debounced write first, so it can't re-persist the
// now-empty maps right after.
export function clearModCache(): number {
    const freed = getModCacheSize()
    if (saveTimer !== null) {
        clearTimeout(saveTimer)
        saveTimer = null
    }
    modCache.clear()
    filesCache.clear()
    linksCache.clear()
    installedMetaCache.clear()
    for (const key of CACHE_STORAGE_KEYS) {
        localStorage.removeItem(key)
    }
    return freed
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
    scheduleStorage()
    return data
}

export async function getCachedModLinks(id: number): Promise<ModLink[]> {
    const entry = linksCache.get(id)
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.links
    const { data } = await api.listModLinks(id)
    linksCache.set(id, { links: data, fetchedAt: Date.now() })
    scheduleStorage()
    return data
}

// Bulk-refreshes installed-mod metadata via the `ids[]` listing filter instead
// of one `get_mod` call per id — turns an N-request refresh into one request
// per ~50 ids. Unconditionally fetches and caches every id passed in (callers
// decide what's stale); ids missing from the response (deleted mods) are
// reported in failedIds. Writes only to installedMetaCache, never modCache.
export async function fetchInstalledModsMeta(
    workshopId: number,
    ids: number[]
): Promise<{ mods: Map<number, Mod>; failedIds: number[] }> {
    const mods = new Map<number, Mod>()
    const failedIds: number[] = []
    for (let i = 0; i < ids.length; i += INSTALLED_META_CHUNK_SIZE) {
        const chunk = ids.slice(i, i + INSTALLED_META_CHUNK_SIZE)
        await waitForForegroundClear()
        try {
            const { data } = await api.listMods(workshopId, { ids: chunk, limit: chunk.length })
            const fetchedAt = Date.now()
            const got = new Set<number>()
            for (const mod of data) {
                installedMetaCache.set(mod.id, { mod, fetchedAt })
                mods.set(mod.id, mod)
                got.add(mod.id)
            }
            for (const id of chunk) {
                if (!got.has(id)) failedIds.push(id)
            }
        } catch {
            failedIds.push(...chunk)
        }
    }
    if (ids.length > 0) scheduleStorage()
    return { mods, failedIds }
}
