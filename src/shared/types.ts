import type { ModFolder } from './bindings'

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
    // null for offsite dependencies (hosted outside modworkshop, e.g. SuperBLT)
    mod_id: number | null
    name?: string
    url?: string | null
    optional: boolean
    // author-defined install order; deps render sorted by it like on modworkshop
    order?: number
    mod: Mod | null
}

export interface InstructsTemplate {
    id: number
    name: string
    instructions: string
    dependencies: ModDependency[]
}

// A user attached to a mod's credits (member of the mod page). `level` is the
// modworkshop role: collaborator | maintainer | contributor | viewer.
export interface ModMember {
    id: number
    name: string
    level: string
    accepted: boolean
    donation_url?: string | null
    avatar?: string
    avatar_has_thumb?: boolean
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
    user: {
        // absent on locally synthesized mods (installedUtils.syntheticMod)
        id?: number
        name: string
        donation_url?: string | null
        avatar?: string
        avatar_has_thumb?: boolean
    }
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
    members?: ModMember[]
    donation?: string | null
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
export const AVATAR_BASE_URL = 'https://storage.modworkshop.net/users/images'
export const GAME_STORAGE_KEY = 'pd3'

export type GameId = 'pd3' | 'pd2' | 'pdth' | 'cb' | 'raid'

export const GAMES: Record<
    GameId,
    {
        name: string
        shortName: string
        workshopId: number
        storageKey: string
        hasNews: boolean
        nexusDomain?: string
    }
> = {
    pd3: {
        name: 'PAYDAY 3',
        shortName: 'PD3',
        workshopId: 853,
        storageKey: 'pd3',
        hasNews: true,
        nexusDomain: 'payday3',
    },
    pd2: { name: 'PAYDAY 2', shortName: 'PD2', workshopId: 1, storageKey: 'pd2', hasNews: true },
    pdth: {
        name: 'PAYDAY: The Heist',
        shortName: 'PDTH',
        workshopId: 2,
        storageKey: 'pdth',
        hasNews: true,
    },
    cb: {
        name: 'Crime Boss: Rockay City',
        shortName: 'CBRC',
        workshopId: 857,
        storageKey: 'cb',
        hasNews: false,
        nexusDomain: 'crimebossrockaycity',
    },
    raid: {
        name: 'RAID: World War II',
        shortName: 'RAID',
        workshopId: 543,
        storageKey: 'raid',
        hasNews: false,
    },
}

// Wire types owned by the Rust side and generated into bindings.ts; re-exported
// here so renderer code keeps one import path for shared shapes.
export type { ModFolder, TopLevelItem, IndexModFile, NewsItem, NewsResult } from './bindings'

export interface InstalledMod {
    uid: string // unique per installed file — stable identity across renames
    id: number
    name: string
    version: string
    filename: string
    enabled: boolean
    installedAt: string
    source?: string // mod source slug; absent = "modworkshop"
    remoteId?: string // source-native mod id; modworkshop identity stays in id/fileId
    fileRemoteId?: string // source-native file id
    author?: string // only recorded for non-modworkshop sources
    thumbnailUrl?: string // absolute CDN URL; only recorded for non-modworkshop sources
    fileId?: number
    fileType?: string
    sha256?: string
    priority?: number // higher = loads later in UE5 = overrides lower-priority mods
    missing?: boolean
    folderId?: string | null // null or absent = root level
    archiveBroken?: boolean
    location?: string // scan target tag; absent = primary target
}

export interface ModsState {
    folders: ModFolder[]
    mods: InstalledMod[]
}

export type SortOption =
    'downloads' | 'likes' | 'views' | 'score' | 'published_at' | 'bumped_at' | 'name' | 'best_match'

export interface ListModsParams {
    query?: string
    limit?: number
    sort?: SortOption
    category_id?: number
    page?: number
    ids?: number[]
    tags?: number[]
    block_tags?: number[]
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
