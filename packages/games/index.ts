export const LAUNCHERS = ['Steam', 'Epic Games', 'Xbox App'] as const

export type LauncherName = (typeof LAUNCHERS)[number]

export interface GameSpec {
    name: string
    shortName: string
    workshopId: number
    storageKey: string
    hasNews: boolean
    requiredLaunchFlag?: string
    launchers: readonly LauncherName[]
}

const GAME_SPECS = {
    pd3: {
        name: 'PAYDAY 3',
        shortName: 'PD3',
        workshopId: 853,
        storageKey: 'pd3',
        hasNews: true,
        requiredLaunchFlag: '-fileopenlog',
        launchers: ['Steam', 'Epic Games', 'Xbox App'],
    },
    pd2: {
        name: 'PAYDAY 2',
        shortName: 'PD2',
        workshopId: 1,
        storageKey: 'pd2',
        hasNews: true,
        launchers: ['Steam', 'Epic Games'],
    },
    pdth: {
        name: 'PAYDAY: The Heist',
        shortName: 'PDTH',
        workshopId: 2,
        storageKey: 'pdth',
        hasNews: true,
        launchers: ['Steam'],
    },
    cb: {
        name: 'Crime Boss: Rockay City',
        shortName: 'CBRC',
        workshopId: 857,
        storageKey: 'cb',
        hasNews: false,
        launchers: ['Steam', 'Epic Games'],
    },
    raid: {
        name: 'RAID: World War II',
        shortName: 'RAID',
        workshopId: 543,
        storageKey: 'raid',
        hasNews: false,
        launchers: ['Steam'],
    },
} satisfies Record<string, GameSpec>

export type GameId = keyof typeof GAME_SPECS

export const GAMES: Record<GameId, GameSpec> = GAME_SPECS

export const GAME_IDS = Object.keys(GAMES) as GameId[]

export function isGameId(value: string | null): value is GameId {
    return value !== null && Object.hasOwn(GAMES, value)
}
