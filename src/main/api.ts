import { app } from 'electron'
import type { Mod, ModFile, Category, Paginated } from '../shared/types'

const BASE = 'https://api.modworkshop.net'
const GAME_ID = 853

const MAX_CONCURRENT = 3
let inFlight = 0
const waitQueue: Array<() => void> = []

function acquire(): Promise<void> {
    return new Promise((resolve) => {
        if (inFlight < MAX_CONCURRENT) {
            inFlight++
            resolve()
        } else {
            waitQueue.push(() => {
                inFlight++
                resolve()
            })
        }
    })
}

function release(): void {
    inFlight--
    const next = waitQueue.shift()
    if (next) next()
}

async function get<T>(path: string, params?: object): Promise<T> {
    const url = new URL(`${BASE}${path}`)
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            if (v != null) url.searchParams.set(k, String(v))
        })
    }
    const headers = {
        Accept: 'application/json',
        'User-Agent': `pd3-mod-manager/${app.getVersion()}`,
    }
    await acquire()
    try {
        let res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
        if (res.status === 429) {
            const jitter = 1500 + Math.random() * 1500
            await new Promise<void>((r) => setTimeout(r, jitter))
            res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
        }
        if (!res.ok) throw new Error(`modworkshop API ${res.status}: ${path}`)
        return res.json()
    } finally {
        release()
    }
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
