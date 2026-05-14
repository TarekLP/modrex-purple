export interface Mod {
    id: number
    name: string
    desc: string
    short_desc: string
    version: string
    downloads: number
    likes: number
    views: number
    published_at: string
    bumped_at: string
    category_id: number
    has_download: boolean
    thumbnail: { file: string } | null
    download: {
        id: number
        version: string
        size: number
        type: string
        download_url: string
    } | null
    user: { name: string }
}

export interface ModFile {
    id: number
    name: string
    version: string
    size: number
    type: string
    download_url: string
}

export interface Category {
    id: number
    name: string
}

export const THUMBNAIL_BASE_URL = 'https://storage.modworkshop.net/mods/images'

export interface InstalledMod {
    id: number
    name: string
    version: string
    filename: string
    enabled: boolean
    installedAt: string
}

export interface ModsState {
    mods: InstalledMod[]
}

export interface Paginated<T> {
    data: T[]
    meta: {
        current_page: number
        last_page: number
        per_page: number
        total: number
    }
}
