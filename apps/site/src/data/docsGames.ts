export const allLaunchers = ['Steam', 'Epic Games', 'Xbox App'] as const

export type LauncherName = (typeof allLaunchers)[number]
export type DocsGameId = 'pd3' | 'pd2' | 'pdth' | 'cb'

export interface OverviewTarget {
    label: string
    code?: string
    path?: string
    note?: string
}

export interface ModTarget {
    label: string
    path: string
    pathIsCode?: boolean
    notes: string
}

export interface DocsGame {
    id: DocsGameId
    slug: string
    name: string
    launchers: readonly LauncherName[]
    overviewTargets: readonly OverviewTarget[]
    targets: readonly ModTarget[]
}

export const docsGames: readonly DocsGame[] = [
    {
        id: 'pd3',
        slug: 'payday-3',
        name: 'PAYDAY 3',
        launchers: ['Steam', 'Epic Games', 'Xbox App'],
        overviewTargets: [
            { code: '.pak', label: 'files', path: '~mods' },
            { label: 'UE4SS Lua mods', note: 'when the loader is installed' },
        ],
        targets: [
            {
                label: 'Pak mods',
                path: 'PAYDAY3/Content/Paks/~mods',
                notes: 'Primary target for pak files. Disabled files are kept under disabled with a .disabled suffix.',
            },
            {
                label: 'UE4SS mods',
                path: 'PAYDAY3/Binaries/Win64/Mods',
                notes: 'Used for Lua mods when UE4SS is installed. Modrex excludes bundled UE4SS framework modules from the installed list.',
            },
        ],
    },
    {
        id: 'pd2',
        slug: 'payday-2',
        name: 'PAYDAY 2',
        launchers: ['Steam', 'Epic Games'],
        overviewTargets: [
            { label: 'BLT/BeardLib folders', path: 'mods' },
            { label: 'asset replacements', path: 'assets/mod_overrides' },
        ],
        targets: [
            {
                label: 'BLT and BeardLib mods',
                path: 'mods',
                notes: 'Modrex recognizes folders with mod.txt or main.xml.',
            },
            {
                label: 'Asset replacements',
                path: 'assets/mod_overrides',
                notes: 'Marker-less folders are routed here when they match the mod_overrides layout.',
            },
            {
                label: 'Host mod packs',
                path: 'Inside the host mod folder',
                pathIsCode: false,
                notes: 'Some packs install inside another mod, such as Menu Backgrounds packs. Modrex tracks these separately.',
            },
        ],
    },
    {
        id: 'pdth',
        slug: 'payday-the-heist',
        name: 'PAYDAY: The Heist',
        launchers: ['Steam'],
        overviewTargets: [
            { label: 'BLT/DAHM folders', path: 'mods' },
            { label: 'asset replacements', path: 'assets/mod_overrides' },
        ],
        targets: [
            {
                label: 'BLT and DAHM mods',
                path: 'mods',
                notes: 'Modrex recognizes BLT folders with mod.txt and DAHM sub-mods with base.lua when they match the mod index.',
            },
            {
                label: 'Asset replacements',
                path: 'assets/mod_overrides',
                notes: 'Marker-less asset replacement folders are routed here.',
            },
        ],
    },
    {
        id: 'cb',
        slug: 'crime-boss',
        name: 'Crime Boss: Rockay City',
        launchers: ['Steam', 'Epic Games'],
        overviewTargets: [
            { label: 'Official ModKit folders', path: 'CrimeBoss/Mods' },
            { label: 'legacy pak files' },
            { label: 'UE4SS Lua mods' },
        ],
        targets: [
            {
                label: 'Official ModKit mods',
                path: 'CrimeBoss/Mods',
                notes: 'Primary target for new installs. Modrex creates the expected folder structure around extracted files when needed.',
            },
            {
                label: 'Legacy pak mods',
                path: 'CrimeBoss/Content/Paks/~mods',
                notes: 'Used for pre-existing loose pak installs and loose-triplet mods.',
            },
            {
                label: 'UE4SS mods',
                path: 'CrimeBoss/Binaries/Win64/Mods',
                notes: 'Used for Lua mods when UE4SS is installed. Bundled UE4SS framework modules are excluded from the installed list.',
            },
        ],
    },
] as const

export function getDocsGame(id: DocsGameId): DocsGame {
    const game = docsGames.find((candidate) => candidate.id === id)

    if (!game) {
        throw new Error(`Unknown docs game: ${id}`)
    }

    return game
}
