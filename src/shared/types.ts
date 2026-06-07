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
    disable_mod_managers?: boolean
    thumbnail: { file: string; has_thumb?: boolean } | null
    download: {
        id: number
        version: string
        size: number | undefined
        type: string | undefined
        download_url: string | undefined
        url?: string
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

export interface ModLink {
    id: number
    name: string
    url: string
    desc?: string
    label?: string
    version?: string
    image_id?: number | null
    downloads?: number
    created_at?: string
}

export interface ModFile {
    id: number
    name: string
    version: string
    size: number
    type: string | undefined
    download_url: string
    url?: string
    image_id?: number | null
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
export const GAME_STORAGE_KEY = 'pd3'

export type GameId = 'pd3' | 'pd2'

export const GAMES: Record<
    GameId,
    { name: string; shortName: string; workshopId: number; storageKey: string }
> = {
    pd3: { name: 'PAYDAY 3', shortName: 'PD3', workshopId: 853, storageKey: 'pd3' },
    pd2: { name: 'PAYDAY 2', shortName: 'PD2', workshopId: 1, storageKey: 'pd2' },
}

export interface ModFolder {
    id: string
    diskName: string // priority-prefixed slug on disk, e.g. '002_weapons'
    displayName: string // user-facing label
    priority: number // shared space with siblings in same parent
    parentId: string | null // null = root level
}

export type TopLevelItem = { type: 'folder'; id: string } | { type: 'mod'; id: string }

export interface InstalledMod {
    uid: string // unique per installed file — stable identity across renames
    id: number
    name: string
    version: string
    filename: string
    enabled: boolean
    installedAt: string
    fileId?: number
    fileType?: string
    sha256?: string
    priority?: number // higher = loads later in UE5 = overrides lower-priority mods
    missing?: boolean
    folderId?: string | null // null or absent = root level
    archiveBroken?: boolean
}

export interface ModsState {
    folders: ModFolder[]
    mods: InstalledMod[]
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

export interface Paginated<T> {
    data: T[]
    meta: {
        current_page: number
        last_page: number
        per_page: number
        total: number
    }
}
