import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { spawn, execSync } from 'child_process'
import { shell } from 'electron'
import type { GameDef, LauncherDef } from './types'

const GAMING_APP_PACKAGE = 'Microsoft.GamingApp_8wekyb3d8bbwe'

const XBOX_DRIVES = ['C', 'D', 'E', 'F', 'G']

function findInXboxGames(game: GameDef): string | null {
    const xboxExe = game.launchers.xbox?.executable ?? game.executable
    for (const drive of XBOX_DRIVES) {
        const driveRoot = `${drive}:\\`
        if (!existsSync(driveRoot)) continue
        let dirs: string[]
        try {
            dirs = readdirSync(driveRoot) as string[]
        } catch {
            continue
        }
        for (const dir of dirs) {
            const candidate = join(driveRoot, dir, game.name, 'Content')
            if (existsSync(join(candidate, xboxExe))) return candidate
        }
    }
    return null
}

function findViaPackageManager(game: GameDef): string | null {
    const productId = game.launchers.xbox?.productId
    if (!productId) return null
    try {
        const script = `$p=Get-AppxPackage|?{$c=Join-Path $_.InstallLocation 'Content\\MicrosoftGame.config';(Test-Path $c)-and((gc $c -Raw)-match '${productId}')}|Select -First 1;if($p){Join-Path $p.InstallLocation 'Content'}`
        const output = execSync(`powershell -NoProfile -NonInteractive -Command "${script}"`, {
            timeout: 5000,
            encoding: 'utf8',
        }).trim()
        if (!output) return null
        const xboxExe = game.launchers.xbox?.executable ?? game.executable
        return existsSync(join(output, xboxExe)) ? output : null
    } catch {
        return null
    }
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
        return findInXboxGames(game) ?? findViaPackageManager(game)
    },

    identifyPath(gamePath: string): boolean {
        return existsSync(join(gamePath, 'MicrosoftGame.config'))
    },

    launch(game: GameDef, gamePath: string): void {
        const helper = join(gamePath, 'gamelaunchhelper.exe')
        if (existsSync(helper)) {
            const child = spawn(helper, [], { detached: true, stdio: 'ignore' })
            child.unref()
        } else {
            const xboxDef = game.launchers.xbox
            if (xboxDef) shell.openExternal(`msxbox://game/?productId=${xboxDef.productId}`)
        }
    },
}
