import type { Mod, ModFile, Category, Paginated } from '../shared/types'

const BASE = 'https://api.modworkshop.net'
const GAME_ID = 853

async function get<T>(path: string, params?: object): Promise<T> {
    const url = new URL(`${BASE}${path}`)
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            if (v != null) url.searchParams.set(k, String(v))
        })
    }
    const res = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'pd3-mod-manager/0.1.0',
        },
        signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`modworkshop API ${res.status}: ${path}`)
    return res.json()
}

export type SortOption =
    | 'downloads'
    | 'likes'
    | 'views'
    | 'score'
    | 'published_at'
    | 'bumped_at'
    | 'name'
    | 'best_match'

export interface ListModsParams {
    query?: string
    limit?: number
    sort?: SortOption
    category_id?: number
    page?: number
}

export const listMods = (params?: ListModsParams) =>
    get<Paginated<Mod>>(`/games/${GAME_ID}/mods`, params)

export const getMod = (id: number) => get<Mod>(`/mods/${id}`)

export const getLatestFile = (modId: number) => get<ModFile>(`/mods/${modId}/files/latest`)

export const listModFiles = (modId: number) => get<Paginated<ModFile>>(`/mods/${modId}/files`)

export const listCategories = () => get<Paginated<Category>>(`/games/${GAME_ID}/categories`)

export const registerDownload = (fileId: number) =>
    fetch(`${BASE}/files/${fileId}/register-download`, { method: 'POST' })
