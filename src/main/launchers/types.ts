export type LauncherId = 'steam' | 'epic' | 'xbox'

export interface GameDef {
    id: string
    name: string
    executable: string
    modsPath: string
    modExtensions: string[]
    launchers: {
        steam?: { appId: number; folderName: string }
        epic?: { displayName: string; slug: string }
        xbox?: { productId: string }
    }
}

export interface LauncherDef {
    id: LauncherId
    name: string
    isInstalled(): boolean
    findGame(game: GameDef): string | null
    identifyPath(gamePath: string): boolean
    launch(game: GameDef, gamePath: string, opts?: string): void
}
