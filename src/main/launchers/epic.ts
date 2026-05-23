import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { shell } from 'electron'
import type { GameDef, LauncherDef } from './types'

const MANIFEST_DIR = join(
    process.env['PROGRAMDATA'] ?? 'C:\\ProgramData',
    'Epic',
    'EpicGamesLauncher',
    'Data',
    'Manifests'
)

interface EpicManifest {
    DisplayName: string
    InstallLocation: string
    AppName: string
}

function readManifest(game: GameDef): EpicManifest | null {
    const epicDef = game.launchers.epic
    if (!epicDef) return null
    if (!existsSync(MANIFEST_DIR)) return null

    let files: string[]
    try {
        files = (readdirSync(MANIFEST_DIR) as string[]).filter((f) => f.endsWith('.item'))
    } catch {
        return null
    }

    for (const file of files) {
        try {
            const manifest = JSON.parse(
                readFileSync(join(MANIFEST_DIR, file), 'utf8')
            ) as EpicManifest
            if (manifest.DisplayName === epicDef.displayName) return manifest
        } catch {
            // skip malformed manifests
        }
    }
    return null
}

export const EpicLauncher: LauncherDef = {
    id: 'epic',
    name: 'Epic Games',

    isInstalled(): boolean {
        return existsSync(MANIFEST_DIR)
    },

    findGame(game: GameDef): string | null {
        return readManifest(game)?.InstallLocation ?? null
    },

    identifyPath(gamePath: string): boolean {
        return existsSync(join(gamePath, '.egstore'))
    },

    launch(game: GameDef, _gamePath: string, _opts?: string): void {
        const manifest = readManifest(game)
        if (!manifest) return
        shell.openExternal(
            `com.epicgames.launcher://apps/${manifest.AppName}?action=launch&silent=true`
        )
    },
}
