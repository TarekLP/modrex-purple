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

export interface InstalledMod {
    id: number
    name: string
    version: string
    filename: string
    enabled: boolean
    installedAt: string
}

export interface ModsState {
    mods: InstalledMod[]
}

export function activeModPath(gamePath: string, filename: string): string {
    return join(gamePath, 'Content', 'Paks', '~mods', filename)
}

export function disabledModPath(gamePath: string, filename: string): string {
    return join(gamePath, 'Content', 'Paks', '~mods', 'disabled', filename)
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

function readState(statePath: string): ModsState {
    if (!existsSync(statePath)) return { mods: [] }
    try {
        return JSON.parse(readFileSync(statePath, 'utf8'))
    } catch {
        return { mods: [] }
    }
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
    const modsDir = join(gamePath, 'Content', 'Paks', '~mods')
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

    const disabledDir = join(gamePath, 'Content', 'Paks', '~mods', 'disabled')
    if (!existsSync(disabledDir)) mkdirSync(disabledDir, { recursive: true })

    const from = activeModPath(gamePath, mod.filename)
    if (existsSync(from)) renameSync(from, disabledModPath(gamePath, mod.filename))

    saveState(statePath, setEnabled(state, modId, false))
}
