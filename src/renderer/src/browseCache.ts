import type { Mod, Category, ModTag, Paginated, SortOption } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000
const CATEGORIES_TTL_MS = 60 * 60 * 1000
const TAGS_TTL_MS = 60 * 60 * 1000

interface BrowseCacheEntry {
    result: Paginated<Mod>
    fetchedAt: number
}

const cache = new Map<string, BrowseCacheEntry>()
const categoriesCache = new Map<number, { categories: Category[]; fetchedAt: number }>()
const tagsCache = new Map<number, { tags: ModTag[]; fetchedAt: number }>()

function makeKey(
    workshopId: number,
    page: number,
    query: string,
    sort: SortOption,
    categoryId: number | undefined,
    includeTags: number[] = [],
    excludeTags: number[] = []
): string {
    const inc = [...includeTags].sort((a, b) => a - b).join(',')
    const exc = [...excludeTags].sort((a, b) => a - b).join(',')
    return `${workshopId}:${page}:${query}:${sort}:${categoryId ?? ''}:${inc}:${exc}`
}

export function getBrowseCache(
    workshopId: number,
    page: number,
    query: string,
    sort: SortOption,
    categoryId: number | undefined,
    includeTags: number[] = [],
    excludeTags: number[] = []
): { result: Paginated<Mod>; stale: boolean } | null {
    const entry = cache.get(
        makeKey(workshopId, page, query, sort, categoryId, includeTags, excludeTags)
    )
    if (!entry) return null
    return { result: entry.result, stale: Date.now() - entry.fetchedAt >= TTL_MS }
}

export function setBrowseCache(
    workshopId: number,
    page: number,
    query: string,
    sort: SortOption,
    categoryId: number | undefined,
    result: Paginated<Mod>,
    includeTags: number[] = [],
    excludeTags: number[] = []
): void {
    cache.set(makeKey(workshopId, page, query, sort, categoryId, includeTags, excludeTags), {
        result,
        fetchedAt: Date.now(),
    })
}

export function getCategoriesCache(workshopId: number): Category[] | null {
    const entry = categoriesCache.get(workshopId)
    if (!entry) return null
    if (Date.now() - entry.fetchedAt >= CATEGORIES_TTL_MS) return null
    return entry.categories
}

export function setCategoriesCache(workshopId: number, categories: Category[]): void {
    categoriesCache.set(workshopId, { categories, fetchedAt: Date.now() })
}

export function getTagsCache(workshopId: number): ModTag[] | null {
    const entry = tagsCache.get(workshopId)
    if (!entry) return null
    if (Date.now() - entry.fetchedAt >= TAGS_TTL_MS) return null
    return entry.tags
}

export function setTagsCache(workshopId: number, tags: ModTag[]): void {
    tagsCache.set(workshopId, { tags, fetchedAt: Date.now() })
}
