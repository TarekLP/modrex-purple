import { execSync } from 'child_process'
import { join, normalize } from 'path'
import { existsSync } from 'fs'

const PD3_RELATIVE_PATH = join('steamapps', 'common', 'PAYDAY3')

export function parseSteamLibraryPath(registryValue: string): string {
    return normalize(registryValue.replace(/\\\\/g, '\\'))
}

export function buildGamePath(libraryPath: string): string {
    return join(parseSteamLibraryPath(libraryPath), PD3_RELATIVE_PATH)
}

function readSteamInstallPath(): string | null {
    try {
        const output = execSync(
            `reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath`,
            { encoding: 'utf8' }
        )
        const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/)
        return match ? normalize(match[1].trim()) : null
    } catch {
        return null
    }
}

function readSteamLibraries(steamPath: string): string[] {
    const vdfPath = join(steamPath, 'steamapps', 'libraryfolders.vdf')
    if (!existsSync(vdfPath)) return [steamPath]

    try {
        const { readFileSync } = require('fs')
        const content = readFileSync(vdfPath, 'utf8')
        const paths: string[] = [steamPath]
        const matches = content.matchAll(/"path"\s+"([^"]+)"/g)
        for (const match of matches) paths.push(normalize(match[1]))
        return paths
    } catch {
        return [steamPath]
    }
}

export function findGamePath(): string | null {
    const steamPath = readSteamInstallPath()
    if (!steamPath) return null

    for (const library of readSteamLibraries(steamPath)) {
        const gamePath = join(library, PD3_RELATIVE_PATH)
        if (existsSync(gamePath)) return gamePath
    }

    return null
}
