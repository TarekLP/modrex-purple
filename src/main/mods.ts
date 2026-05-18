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

export function stripPriorityPrefix(filename: string): string {
    return filename.replace(/^\d+_/, '')
}

export function applyPriorityPrefix(filename: string, priority: number): string {
    return priority.toString().padStart(3, '0') + '_' + stripPriorityPrefix(filename)
}

export function activeModPath(gamePath: string, filename: string): string {
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', filename)
}

export function disabledModPath(gamePath: string, filename: string): string {
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', filename + '.disabled')
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
            if (file.endsWith('.pak.disabled')) {
                const pakFilename = file.slice(0, -'.disabled'.length)
                if (!knownFilenames.has(pakFilename)) {
                    untracked.push({ filename: pakFilename, enabled: false })
                }
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

    // Migrate disabled mods from legacy .pak to .pak.disabled format
    const disabledDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
    for (const m of state.mods.filter((m) => !m.enabled)) {
        const newPath = disabledModPath(gamePath, m.filename)
        const legacyPath = join(disabledDir, m.filename)
        try {
            await fsp.access(newPath)
        } catch {
            try {
                await fsp.access(legacyPath)
                renameSync(legacyPath, newPath)
            } catch {}
        }
    }

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
    const reconciled = state.mods.map((m, i) =>
        checks[i] ? { ...m, missing: undefined } : { ...m, missing: true }
    )
    const stateChanged = reconciled.some((m, i) => !!m.missing !== !!state.mods[i].missing)
    if (stateChanged) {
        saveState(statePath, { mods: reconciled })
    }

    if (reconciled.some((m) => m.priority === undefined)) {
        const maxExisting = reconciled.reduce((max, m) => Math.max(max, m.priority ?? 0), 0)
        let next = maxExisting
        const migrated = reconciled.map((m) =>
            m.priority !== undefined ? m : { ...m, priority: ++next }
        )
        saveState(statePath, { mods: migrated })
        return { mods: migrated }
    }

    return { mods: reconciled }
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

    const state = readState(statePath)
    const existing = state.mods.find((m) => m.id === mod.id)
    const priority =
        existing?.priority ?? state.mods.reduce((max, m) => Math.max(max, m.priority ?? 0), 0) + 1
    const filename = applyPriorityPrefix(mod.filename, priority)

    copyFileSync(sourcePath, activeModPath(gamePath, filename))

    if (existing && existing.filename !== filename) {
        const oldPath = existing.enabled
            ? activeModPath(gamePath, existing.filename)
            : disabledModPath(gamePath, existing.filename)
        if (existsSync(oldPath)) rmSync(oldPath, { force: true })
    }

    saveState(
        statePath,
        addToState(state, {
            ...mod,
            filename,
            priority,
            enabled: true,
            installedAt: new Date().toISOString(),
        })
    )
}

export function reorderMods(gamePath: string, statePath: string, orderedIds: number[]): void {
    const state = readState(statePath)
    const total = orderedIds.length
    const updated = state.mods.map((mod) => {
        const pos = orderedIds.indexOf(mod.id)
        if (pos === -1) return mod
        const priority = total - pos
        const newFilename = applyPriorityPrefix(mod.filename, priority)
        if (newFilename !== mod.filename) {
            const oldPath = mod.enabled
                ? activeModPath(gamePath, mod.filename)
                : disabledModPath(gamePath, mod.filename)
            const newPath = mod.enabled
                ? activeModPath(gamePath, newFilename)
                : disabledModPath(gamePath, newFilename)
            if (existsSync(oldPath)) renameSync(oldPath, newPath)
        }
        return { ...mod, filename: newFilename, priority }
    })
    saveState(statePath, { mods: updated })
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
