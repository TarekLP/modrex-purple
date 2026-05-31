import type { Mod, Category, Paginated, SortOption } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000
const CATEGORIES_TTL_MS = 60 * 60 * 1000

interface BrowseCacheEntry {
    result: Paginated<Mod>
    fetchedAt: number
}

const cache = new Map<string, BrowseCacheEntry>()
let categoriesEntry: { categories: Category[]; fetchedAt: number } | null = null

function makeKey(
    page: number,
    query: string,
    sort: SortOption,
    categoryId: number | undefined
): string {
    return `${page}:${query}:${sort}:${categoryId ?? ''}`
}

export function getBrowseCache(
    page: number,
    query: string,
    sort: SortOption,
    categoryId: number | undefined
): { result: Paginated<Mod>; stale: boolean } | null {
    const entry = cache.get(makeKey(page, query, sort, categoryId))
    if (!entry) return null
    return { result: entry.result, stale: Date.now() - entry.fetchedAt >= TTL_MS }
}

export function setBrowseCache(
    page: number,
    query: string,
    sort: SortOption,
    categoryId: number | undefined,
    result: Paginated<Mod>
): void {
    cache.set(makeKey(page, query, sort, categoryId), { result, fetchedAt: Date.now() })
}

export function getCategoriesCache(): Category[] | null {
    if (!categoriesEntry) return null
    if (Date.now() - categoriesEntry.fetchedAt >= CATEGORIES_TTL_MS) return null
    return categoriesEntry.categories
}

export function setCategoriesCache(categories: Category[]): void {
    categoriesEntry = { categories, fetchedAt: Date.now() }
}
