import { existsSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { shell } from 'electron'
import type { GameDef, LauncherDef } from './types'

const GAMING_APP_PACKAGE = 'Microsoft.GamingApp_8wekyb3d8bbwe'

const XBOX_DRIVES = ['C', 'D', 'E', 'F', 'G']

function findInXboxGames(game: GameDef): string | null {
    const xboxExe = game.launchers.xbox?.executable ?? game.executable
    for (const drive of XBOX_DRIVES) {
        const candidate = join(`${drive}:`, 'XboxGames', game.name, 'Content')
        if (existsSync(join(candidate, xboxExe))) return candidate
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

    launch(game: GameDef, gamePath: string, opts?: string): void {
        const xboxExe = game.launchers.xbox?.executable ?? game.executable
        const exe = join(gamePath, xboxExe)
        if (existsSync(exe)) {
            const args = opts?.trim().split(/\s+/).filter(Boolean) ?? []
            const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
            child.unref()
        } else {
            console.warn(`Xbox executable not found at ${exe}, falling back to URI launch`)
            const xboxDef = game.launchers.xbox
            if (xboxDef) shell.openExternal(`msxbox://game/?productId=${xboxDef.productId}`)
        }
    },
}
