import { join } from 'path'
import { spawn } from 'child_process'
import { SteamLauncher } from './steam'
import { EpicLauncher } from './epic'
import { XboxLauncher } from './xbox'
import type { GameDef, LauncherId, LauncherDef } from './types'

export const LAUNCHERS: LauncherDef[] = [SteamLauncher, EpicLauncher, XboxLauncher]

export function autoDetect(game: GameDef): { launcher: LauncherId; gamePath: string } | null {
    for (const launcher of LAUNCHERS) {
        if (!launcher.isInstalled()) continue
        const gamePath = launcher.findGame(game)
        if (gamePath) return { launcher: launcher.id, gamePath }
    }
    return null
}

export function identifyLauncher(gamePath: string): LauncherId | 'manual' {
    for (const launcher of LAUNCHERS) {
        if (launcher.identifyPath(gamePath)) return launcher.id
    }
    return 'manual'
}

export function launchGame(
    game: GameDef,
    launcher: LauncherId | 'manual',
    gamePath: string,
    opts?: string
): void {
    const found = LAUNCHERS.find((l) => l.id === launcher)
    if (found) {
        found.launch(game, gamePath, opts)
        return
    }
    const args = opts?.trim().split(/\s+/).filter(Boolean) ?? []
    const child = spawn(join(gamePath, game.executable), args, {
        detached: true,
        stdio: 'ignore',
    })
    child.unref()
}
