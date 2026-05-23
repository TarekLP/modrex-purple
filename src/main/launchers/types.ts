export type LauncherId = 'steam' | 'epic' | 'xbox'

export interface GameDef {
    id: string
    name: string
    /** Relative path to the executable — used to validate a game path is correct */
    executable: string
    /** Relative path from game root where mods are placed, e.g. 'PAYDAY3/Content/Paks/~mods' */
    modsPath: string
    modExtensions: string[]
    launchers: {
        steam?: {
            appId: number
            /** Folder name inside steamapps/common/, e.g. 'PAYDAY3' */
            folderName: string
        }
        epic?: {
            /** DisplayName field in Epic manifest .item files — used for detection */
            displayName: string
            /** Store URL slug, e.g. 'payday-3' — informational only */
            slug: string
        }
        xbox?: {
            /** Microsoft Store product ID, e.g. '9NPZVDCH73SX' */
            productId: string
        }
    }
}

export interface LauncherDef {
    id: LauncherId
    name: string
    /** Returns true if the launcher application itself is installed on this machine */
    isInstalled(): boolean
    /** Returns the game install path, or null if the game is not installed via this launcher */
    findGame(game: GameDef): string | null
    /** Returns true if the given path was installed by this launcher (via marker files) */
    identifyPath(gamePath: string): boolean
    /** Launches the game; opts is launcher-specific (e.g. Steam launch flags) */
    launch(game: GameDef, gamePath: string, opts?: string): void
}
