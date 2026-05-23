import { execSync, spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, normalize } from 'path'
import { shell } from 'electron'
import type { GameDef, LauncherDef } from './types'

export function parseSteamLibraryPath(registryValue: string): string {
    return normalize(registryValue.replace(/\\\\/g, '\\'))
}

export function buildGamePath(libraryPath: string, folderName: string): string {
    return join(parseSteamLibraryPath(libraryPath), 'steamapps', 'common', folderName)
}

function steamBin(steamPath: string): string {
    if (process.platform !== 'win32') {
        const sh = join(steamPath, 'steam.sh')
        return existsSync(sh) ? sh : 'steam'
    }
    return join(steamPath, 'steam.exe')
}

function readSteamInstallPath(): string | null {
    if (process.platform === 'win32') {
        try {
            const output = execSync(
                `reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath`,
                { encoding: 'utf8' }
            )
            const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/)
            return match ? normalize(match[1].trim()) : null
        } catch (e) {
            console.warn('Steam registry read failed:', e)
            return null
        }
    }

    if (process.platform === 'linux') {
        const xdgData = process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share')
        const candidates = [
            process.env['STEAM_DIR'],
            join(xdgData, 'Steam'),
            join(homedir(), '.steam', 'steam'),
            join(homedir(), '.steam', 'Steam'),
            join(homedir(), 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
            join(homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
        ].filter(Boolean) as string[]
        for (const p of candidates) {
            if (existsSync(join(p, 'steamapps'))) return p
        }
    }

    return null
}

function readSteamLibraries(steamPath: string): string[] {
    const vdfPath = join(steamPath, 'steamapps', 'libraryfolders.vdf')
    if (!existsSync(vdfPath)) return [steamPath]
    try {
        const content = readFileSync(vdfPath, 'utf8')
        const paths: string[] = [steamPath]
        const matches = content.matchAll(/"path"\s+"([^"]+)"/g)
        for (const match of matches) paths.push(normalize(match[1]))
        return paths
    } catch (e) {
        console.warn('Failed to read Steam library folders:', e)
        return [steamPath]
    }
}

export const SteamLauncher: LauncherDef = {
    id: 'steam',
    name: 'Steam',

    isInstalled(): boolean {
        return readSteamInstallPath() !== null
    },

    findGame(game: GameDef): string | null {
        const steamDef = game.launchers.steam
        if (!steamDef) return null
        const steamPath = readSteamInstallPath()
        if (!steamPath) return null
        for (const library of readSteamLibraries(steamPath)) {
            const gamePath = join(library, 'steamapps', 'common', steamDef.folderName)
            if (existsSync(gamePath)) return gamePath
        }
        return null
    },

    identifyPath(gamePath: string): boolean {
        return existsSync(join(gamePath, 'steam_appid.txt'))
    },

    launch(game: GameDef, _gamePath: string, opts?: string): void {
        const steamDef = game.launchers.steam
        if (!steamDef) return
        const trimmedOpts = opts?.trim()
        const steamPath = readSteamInstallPath()
        if (trimmedOpts && steamPath) {
            const child = spawn(
                steamBin(steamPath),
                ['-applaunch', String(steamDef.appId), ...trimmedOpts.split(/\s+/)],
                { detached: true, stdio: 'ignore' }
            )
            child.unref()
        } else {
            shell.openExternal(`steam://rungameid/${steamDef.appId}`)
        }
    },
}
