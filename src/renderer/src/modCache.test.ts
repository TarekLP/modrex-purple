import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import type * as ModCacheMod from './modCache'
import type { Mod, ModFile, ModLink } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000
const STORAGE_KEY = 'modrex:mod-cache'

function makeLocalStorage() {
    const store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = value
        },
    }
}

function makeMod(id: number): Mod {
    return {
        id,
        name: `Mod ${id}`,
        desc: '',
        short_desc: '',
        version: '1.0',
        downloads: 0,
        likes: 0,
        views: 0,
        published_at: '',
        bumped_at: '',
        category_id: 0,
        has_download: false,
        thumbnail: null,
        download: null,
        user: { name: 'Test' },
    }
}

function makeFile(id: number): ModFile {
    return {
        id,
        name: `file-${id}`,
        version: '1.0',
        size: 100,
        type: 'pak',
        download_url: `https://cdn.example.com/${id}.pak`,
    }
}

function makeLink(id: number): ModLink {
    return { id, name: `link-${id}`, url: `https://example.com/${id}` }
}

let mockGetMod: ReturnType<typeof vi.fn>
let mockListModFiles: ReturnType<typeof vi.fn>
let mockListModLinks: ReturnType<typeof vi.fn>
let storage: ReturnType<typeof makeLocalStorage>
let cache!: typeof ModCacheMod

beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))

    mockGetMod = vi.fn()
    mockListModFiles = vi.fn()
    mockListModLinks = vi.fn()

    vi.doMock('./api', () => ({
        api: {
            getMod: mockGetMod,
            listModFiles: mockListModFiles,
            listModLinks: mockListModLinks,
        },
    }))

    storage = makeLocalStorage()
    vi.stubGlobal('localStorage', storage)

    cache = await import('./modCache')
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('getModCacheEntry', () => {
    it('returns undefined for an unknown id', () => {
        expect(cache.getModCacheEntry(1)).toBeUndefined()
    })

    it('returns the entry after a successful getCachedMod', async () => {
        const mod = makeMod(1)
        mockGetMod.mockResolvedValue(mod)
        await cache.getCachedMod(1)
        const entry = cache.getModCacheEntry(1)
        expect(entry).toBeDefined()
        expect(entry!.mod).toBe(mod)
        expect(entry!.fetchedAt).toBe(0)
    })
})

describe('getCachedMod', () => {
    it('calls api.getMod on a cache miss', async () => {
        const mod = makeMod(1)
        mockGetMod.mockResolvedValue(mod)
        const result = await cache.getCachedMod(1)
        expect(mockGetMod).toHaveBeenCalledOnce()
        expect(result).toBe(mod)
    })

    it('returns the cached value on a hit without calling api.getMod', async () => {
        mockGetMod.mockResolvedValue(makeMod(1))
        await cache.getCachedMod(1)
        await cache.getCachedMod(1)
        expect(mockGetMod).toHaveBeenCalledOnce()
    })

    it('re-fetches when the TTL has expired', async () => {
        const mod2 = { ...makeMod(1), name: 'Updated' }
        mockGetMod.mockResolvedValueOnce(makeMod(1)).mockResolvedValueOnce(mod2)
        await cache.getCachedMod(1)
        vi.setSystemTime(new Date(TTL_MS))
        const result = await cache.getCachedMod(1)
        expect(mockGetMod).toHaveBeenCalledTimes(2)
        expect(result).toBe(mod2)
    })

    it('returns the cached value just before the TTL expires', async () => {
        mockGetMod.mockResolvedValue(makeMod(1))
        await cache.getCachedMod(1)
        vi.setSystemTime(new Date(TTL_MS - 1))
        await cache.getCachedMod(1)
        expect(mockGetMod).toHaveBeenCalledOnce()
    })
})

describe('getCachedModFiles', () => {
    it('calls api.listModFiles on a miss and caches the result', async () => {
        const files = [makeFile(1)]
        mockListModFiles.mockResolvedValue({ data: files })
        expect(await cache.getCachedModFiles(1)).toEqual(files)
        await cache.getCachedModFiles(1)
        expect(mockListModFiles).toHaveBeenCalledOnce()
    })

    it('re-fetches when the TTL has expired', async () => {
        const files2 = [makeFile(2)]
        mockListModFiles
            .mockResolvedValueOnce({ data: [makeFile(1)] })
            .mockResolvedValueOnce({ data: files2 })
        await cache.getCachedModFiles(1)
        vi.setSystemTime(new Date(TTL_MS))
        expect(await cache.getCachedModFiles(1)).toEqual(files2)
        expect(mockListModFiles).toHaveBeenCalledTimes(2)
    })
})

describe('getCachedModLinks', () => {
    it('calls api.listModLinks on a miss and caches the result', async () => {
        const links = [makeLink(1)]
        mockListModLinks.mockResolvedValue({ data: links })
        expect(await cache.getCachedModLinks(1)).toEqual(links)
        await cache.getCachedModLinks(1)
        expect(mockListModLinks).toHaveBeenCalledOnce()
    })

    it('re-fetches when the TTL has expired', async () => {
        const links2 = [makeLink(2)]
        mockListModLinks
            .mockResolvedValueOnce({ data: [makeLink(1)] })
            .mockResolvedValueOnce({ data: links2 })
        await cache.getCachedModLinks(1)
        vi.setSystemTime(new Date(TTL_MS))
        expect(await cache.getCachedModLinks(1)).toEqual(links2)
        expect(mockListModLinks).toHaveBeenCalledTimes(2)
    })
})

describe('loadFromStorage', () => {
    async function importWithStorage() {
        vi.resetModules()
        return (await import('./modCache')) as typeof ModCacheMod
    }

    it('pre-warms the cache with entries younger than the storage TTL', async () => {
        const mod = makeMod(99)
        storage.setItem(STORAGE_KEY, JSON.stringify({ '99': { mod, fetchedAt: 0 } }))
        const freshCache = await importWithStorage()
        expect(freshCache.getModCacheEntry(99)!.mod).toEqual(mod)
    })

    it('skips entries at or past the storage TTL', async () => {
        storage.setItem(STORAGE_KEY, JSON.stringify({ '99': { mod: makeMod(99), fetchedAt: 0 } }))
        vi.setSystemTime(new Date(STORAGE_TTL_MS))
        const freshCache = await importWithStorage()
        expect(freshCache.getModCacheEntry(99)).toBeUndefined()
    })

    it('silently handles corrupt JSON in localStorage', async () => {
        storage.setItem(STORAGE_KEY, 'not valid json')
        const freshCache = await importWithStorage()
        expect(freshCache.getModCacheEntry(1)).toBeUndefined()
    })

    it('starts with an empty cache when the storage key is absent', async () => {
        const freshCache = await importWithStorage()
        expect(freshCache.getModCacheEntry(1)).toBeUndefined()
    })
})

describe('scheduleStorage', () => {
    it('writes to localStorage after the 2s debounce', async () => {
        mockGetMod.mockResolvedValue(makeMod(1))
        await cache.getCachedMod(1)
        expect(storage.getItem(STORAGE_KEY)).toBeNull()
        vi.advanceTimersByTime(2001)
        const stored = JSON.parse(storage.getItem(STORAGE_KEY)!)
        expect(stored['1']).toBeDefined()
    })

    it('does not write before the debounce period elapses', async () => {
        mockGetMod.mockResolvedValue(makeMod(1))
        await cache.getCachedMod(1)
        vi.advanceTimersByTime(1999)
        expect(storage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('debounces multiple rapid fetches into a single flush cycle', async () => {
        const setItemSpy = vi.spyOn(storage, 'setItem')
        mockGetMod.mockResolvedValueOnce(makeMod(1)).mockResolvedValueOnce(makeMod(2))
        await cache.getCachedMod(1)
        await cache.getCachedMod(2)
        vi.advanceTimersByTime(2001)
        // One flush writes three keys: mod-cache, files-cache, links-cache
        expect(setItemSpy).toHaveBeenCalledTimes(3)
    })
})
