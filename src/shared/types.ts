export interface ModImage {
    id: number
    file: string
    type: string
    size: number
    display_order: number
    visible: boolean
    has_thumb: boolean
}

export interface ModDependency {
    id: number
    mod_id: number
    optional: boolean
    mod: Mod
}

export interface InstructsTemplate {
    id: number
    name: string
    instructions: string
    dependencies: ModDependency[]
}

export interface ModTag {
    id: number
    name: string
    color: string
}

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
    thumbnail: { file: string; has_thumb?: boolean } | null
    download: {
        id: number
        version: string
        size: number
        type: string
        download_url: string
    } | null
    user: { name: string }
    // Extended fields returned by getMod full response
    changelog?: string
    instructions?: string
    license?: string
    repo_url?: string | null
    banner?: ModImage | null
    images?: ModImage[]
    dependencies?: ModDependency[]
    instructs_template?: InstructsTemplate | null
    tags?: ModTag[]
}

export interface ModFile {
    id: number
    name: string
    version: string
    size: number
    type: string
    download_url: string
    desc?: string
    label?: string
    downloads?: number
    created_at?: string
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
    fileId?: number
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
