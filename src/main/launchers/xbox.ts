import { existsSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { shell } from 'electron'
import type { GameDef, LauncherDef } from './types'

const GAMING_APP_PACKAGE = 'Microsoft.GamingApp_8wekyb3d8bbwe'

const XBOX_DRIVES = ['C', 'D', 'E', 'F', 'G']

function findInXboxGames(game: GameDef): string | null {
    for (const drive of XBOX_DRIVES) {
        const candidate = join(`${drive}:`, 'XboxGames', game.name)
        if (existsSync(join(candidate, game.executable))) return candidate
    }
    return null
}

export const XboxLauncher: LauncherDef = {
    id: 'xbox',
    name: 'Xbox',

    isInstalled(): boolean {
        if (process.platform !== 'win32') return false
        const appPath = join(
            process.env['LOCALAPPDATA'] ?? 'C:\\Users\\Default\\AppData\\Local',
            'Packages',
            GAMING_APP_PACKAGE
        )
        return existsSync(appPath)
    },

    findGame(game: GameDef): string | null {
        if (!game.launchers.xbox) return null
        return findInXboxGames(game)
    },

    identifyPath(gamePath: string): boolean {
        return existsSync(join(gamePath, 'MicrosoftGame.config'))
    },

    launch(game: GameDef, gamePath: string, _opts?: string): void {
        const exe = join(gamePath, game.executable)
        if (existsSync(exe)) {
            const child = spawn(exe, [], { detached: true, stdio: 'ignore' })
            child.unref()
        } else {
            // Fallback: open via Xbox app if exe not found at expected path
            const xboxDef = game.launchers.xbox
            if (xboxDef) shell.openExternal(`msxbox://game/?productId=${xboxDef.productId}`)
        }
    },
}
