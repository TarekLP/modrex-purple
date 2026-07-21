import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import type {
    getBrowseCache as _getBrowseCache,
    setBrowseCache as _setBrowseCache,
    getCategoriesCache as _getCategoriesCache,
    setCategoriesCache as _setCategoriesCache,
} from './browseCache'
import type { Category, Mod, Paginated } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000
const CATEGORIES_TTL_MS = 60 * 60 * 1000

const PD3 = 853
const PD2 = 1

function makeResult(page = 1): Paginated<Mod> {
    return { data: [], meta: { current_page: page, last_page: 1, per_page: 24, total: 0 } }
}

let getBrowseCache: typeof _getBrowseCache
let setBrowseCache: typeof _setBrowseCache
let getCategoriesCache: typeof _getCategoriesCache
let setCategoriesCache: typeof _setCategoriesCache

beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))
    const mod = await import('./browseCache')
    getBrowseCache = mod.getBrowseCache
    setBrowseCache = mod.setBrowseCache
    getCategoriesCache = mod.getCategoriesCache
    setCategoriesCache = mod.setCategoriesCache
})

afterEach(() => {
    vi.useRealTimers()
})

describe('getBrowseCache', () => {
    it('returns null for an unknown key', () => {
        expect(getBrowseCache(PD3, 1, '', 'downloads', undefined)).toBeNull()
    })

    it('returns result with stale: false when the entry is fresh', () => {
        const result = makeResult()
        setBrowseCache(PD3, 1, '', 'downloads', undefined, result)
        const entry = getBrowseCache(PD3, 1, '', 'downloads', undefined)
        expect(entry).not.toBeNull()
        expect(entry!.result).toBe(result)
        expect(entry!.stale).toBe(false)
    })

    it('returns stale: true at the TTL boundary', () => {
        setBrowseCache(PD3, 1, '', 'downloads', undefined, makeResult())
        vi.setSystemTime(new Date(TTL_MS))
        expect(getBrowseCache(PD3, 1, '', 'downloads', undefined)!.stale).toBe(true)
    })

    it('returns stale: false just before the TTL boundary', () => {
        setBrowseCache(PD3, 1, '', 'downloads', undefined, makeResult())
        vi.setSystemTime(new Date(TTL_MS - 1))
        expect(getBrowseCache(PD3, 1, '', 'downloads', undefined)!.stale).toBe(false)
    })
})

describe('setBrowseCache key isolation', () => {
    it('different pages produce independent cache entries', () => {
        const r1 = makeResult(1)
        const r2 = makeResult(2)
        setBrowseCache(PD3, 1, '', 'downloads', undefined, r1)
        setBrowseCache(PD3, 2, '', 'downloads', undefined, r2)
        expect(getBrowseCache(PD3, 1, '', 'downloads', undefined)!.result).toBe(r1)
        expect(getBrowseCache(PD3, 2, '', 'downloads', undefined)!.result).toBe(r2)
    })

    it('different queries produce independent cache entries', () => {
        const r1 = makeResult()
        const r2 = makeResult()
        setBrowseCache(PD3, 1, 'foo', 'downloads', undefined, r1)
        setBrowseCache(PD3, 1, 'bar', 'downloads', undefined, r2)
        expect(getBrowseCache(PD3, 1, 'foo', 'downloads', undefined)!.result).toBe(r1)
        expect(getBrowseCache(PD3, 1, 'bar', 'downloads', undefined)!.result).toBe(r2)
    })

    it('different sort options produce independent cache entries', () => {
        const r1 = makeResult()
        const r2 = makeResult()
        setBrowseCache(PD3, 1, '', 'downloads', undefined, r1)
        setBrowseCache(PD3, 1, '', 'likes', undefined, r2)
        expect(getBrowseCache(PD3, 1, '', 'downloads', undefined)!.result).toBe(r1)
        expect(getBrowseCache(PD3, 1, '', 'likes', undefined)!.result).toBe(r2)
    })

    it('different categoryIds produce independent cache entries', () => {
        const r1 = makeResult()
        const r2 = makeResult()
        setBrowseCache(PD3, 1, '', 'downloads', 5, r1)
        setBrowseCache(PD3, 1, '', 'downloads', 10, r2)
        expect(getBrowseCache(PD3, 1, '', 'downloads', 5)!.result).toBe(r1)
        expect(getBrowseCache(PD3, 1, '', 'downloads', 10)!.result).toBe(r2)
    })

    it('undefined categoryId does not collide with a numeric categoryId', () => {
        const rUndef = makeResult()
        const rZero = makeResult()
        setBrowseCache(PD3, 1, '', 'downloads', undefined, rUndef)
        setBrowseCache(PD3, 1, '', 'downloads', 0, rZero)
        expect(getBrowseCache(PD3, 1, '', 'downloads', undefined)!.result).toBe(rUndef)
        expect(getBrowseCache(PD3, 1, '', 'downloads', 0)!.result).toBe(rZero)
    })

    it('different games produce independent cache entries', () => {
        const r1 = makeResult()
        const r2 = makeResult()
        setBrowseCache(PD3, 1, '', 'downloads', undefined, r1)
        setBrowseCache(PD2, 1, '', 'downloads', undefined, r2)
        expect(getBrowseCache(PD3, 1, '', 'downloads', undefined)!.result).toBe(r1)
        expect(getBrowseCache(PD2, 1, '', 'downloads', undefined)!.result).toBe(r2)
    })
})

describe('getCategoriesCache', () => {
    it('returns null when not yet set', () => {
        expect(getCategoriesCache(PD3)).toBeNull()
    })

    it('returns the categories when fresh', () => {
        const cats: Category[] = [{ id: 1, name: 'Maps' }]
        setCategoriesCache(PD3, cats)
        expect(getCategoriesCache(PD3)).toBe(cats)
    })

    it('returns null at the TTL boundary', () => {
        setCategoriesCache(PD3, [{ id: 1, name: 'Maps' }])
        vi.setSystemTime(new Date(CATEGORIES_TTL_MS))
        expect(getCategoriesCache(PD3)).toBeNull()
    })

    it('returns the categories just before the TTL boundary', () => {
        const cats: Category[] = [{ id: 1, name: 'Maps' }]
        setCategoriesCache(PD3, cats)
        vi.setSystemTime(new Date(CATEGORIES_TTL_MS - 1))
        expect(getCategoriesCache(PD3)).toBe(cats)
    })

    it('different games produce independent category caches', () => {
        const pd3Cats: Category[] = [{ id: 1, name: 'Weapons' }]
        const pd2Cats: Category[] = [{ id: 2, name: 'Heists' }]
        setCategoriesCache(PD3, pd3Cats)
        setCategoriesCache(PD2, pd2Cats)
        expect(getCategoriesCache(PD3)).toBe(pd3Cats)
        expect(getCategoriesCache(PD2)).toBe(pd2Cats)
    })
})
