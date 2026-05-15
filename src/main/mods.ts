import { join } from 'path'
import {
    copyFileSync,
    rmSync,
    renameSync,
    mkdirSync,
    existsSync,
    readFileSync,
    writeFileSync,
} from 'fs'
import { promises as fsp } from 'fs'
import type { InstalledMod, ModsState } from '../shared/types'

export type { InstalledMod, ModsState }

export function activeModPath(gamePath: string, filename: string): string {
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', filename)
}

export function disabledModPath(gamePath: string, filename: string): string {
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', filename)
}

export function addToState(state: ModsState, mod: InstalledMod): ModsState {
    return { mods: [...state.mods.filter((m) => m.id !== mod.id), mod] }
}

export function removeFromState(state: ModsState, modId: number): ModsState {
    return { mods: state.mods.filter((m) => m.id !== modId) }
}

export function setEnabled(state: ModsState, modId: number, enabled: boolean): ModsState {
    return { mods: state.mods.map((m) => (m.id === modId ? { ...m, enabled } : m)) }
}

export function readState(statePath: string): ModsState {
    if (!existsSync(statePath)) return { mods: [] }
    try {
        return JSON.parse(readFileSync(statePath, 'utf8'))
    } catch {
        return { mods: [] }
    }
}

export async function findUntrackedPaks(
    gamePath: string,
    knownFilenames: Set<string>
): Promise<{ filename: string; enabled: boolean }[]> {
    const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
    try {
        await fsp.access(modsBak)
        return []
    } catch {}

    const activeDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
    const untracked: { filename: string; enabled: boolean }[] = []

    try {
        for (const file of await fsp.readdir(activeDir)) {
            if (file.endsWith('.pak') && !knownFilenames.has(file)) {
                untracked.push({ filename: file, enabled: true })
            }
        }
    } catch {}

    try {
        for (const file of await fsp.readdir(disabledDir)) {
            if (file.endsWith('.pak') && !knownFilenames.has(file)) {
                untracked.push({ filename: file, enabled: false })
            }
        }
    } catch {}

    return untracked
}

export async function reconcileState(gamePath: string, statePath: string): Promise<ModsState> {
    // ~mods.bak means mods are temporarily hidden for a vanilla launch — trust state as-is
    const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
    try {
        await fsp.access(modsBak)
        return readState(statePath)
    } catch {}

    const state = readState(statePath)
    const checks = await Promise.all(
        state.mods.map(async (m) => {
            try {
                await fsp.access(activeModPath(gamePath, m.filename))
                return true
            } catch {}
            try {
                await fsp.access(disabledModPath(gamePath, m.filename))
                return true
            } catch {}
            return false
        })
    )
    const valid = state.mods.filter((_, i) => checks[i])
    if (valid.length !== state.mods.length) {
        const cleaned = { mods: valid }
        saveState(statePath, cleaned)
        return cleaned
    }
    return state
}

function saveState(statePath: string, state: ModsState): void {
    writeFileSync(statePath, JSON.stringify(state, null, 4))
}

export function installMod(
    gamePath: string,
    statePath: string,
    mod: InstalledMod,
    sourcePath: string
): void {
    const modsDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })

    copyFileSync(sourcePath, activeModPath(gamePath, mod.filename))
    saveState(
        statePath,
        addToState(readState(statePath), {
            ...mod,
            enabled: true,
            installedAt: new Date().toISOString(),
        })
    )
}

export function uninstallMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod) return

    const path = mod.enabled
        ? activeModPath(gamePath, mod.filename)
        : disabledModPath(gamePath, mod.filename)
    if (existsSync(path)) rmSync(path)

    saveState(statePath, removeFromState(state, modId))
}

export function enableMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod || mod.enabled) return

    const from = disabledModPath(gamePath, mod.filename)
    if (existsSync(from)) renameSync(from, activeModPath(gamePath, mod.filename))

    saveState(statePath, setEnabled(state, modId, true))
}

export function disableMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod || !mod.enabled) return

    const disabledDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
    if (!existsSync(disabledDir)) mkdirSync(disabledDir, { recursive: true })

    const from = activeModPath(gamePath, mod.filename)
    if (existsSync(from)) renameSync(from, disabledModPath(gamePath, mod.filename))

    saveState(statePath, setEnabled(state, modId, false))
}
