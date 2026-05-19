import { join } from 'path'
import {
    copyFileSync,
    rmSync,
    renameSync,
    mkdirSync,
    existsSync,
    readFileSync,
    writeFileSync,
    createReadStream,
} from 'fs'
import { promises as fsp } from 'fs'
import { createHash, randomUUID } from 'crypto'
import type { InstalledMod, ModFolder, ModsState, TopLevelItem } from '../shared/types'

export type { InstalledMod, ModFolder, ModsState, TopLevelItem }

export function stripPriorityPrefix(filename: string): string {
    return filename.replace(/^\d+_/, '')
}

export function applyPriorityPrefix(filename: string, priority: number): string {
    return priority.toString().padStart(3, '0') + '_' + stripPriorityPrefix(filename)
}

export function activeModPath(
    gamePath: string,
    filename: string,
    folderDiskName?: string | null
): string {
    if (folderDiskName) {
        return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', folderDiskName, filename)
    }
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', filename)
}

export function disabledModPath(
    gamePath: string,
    filename: string,
    folderDiskName?: string | null
): string {
    if (folderDiskName) {
        return join(
            gamePath,
            'PAYDAY3',
            'Content',
            'Paks',
            '~mods',
            'disabled',
            folderDiskName,
            filename + '.disabled'
        )
    }
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', filename + '.disabled')
}

export async function computeSha256(filePath: string): Promise<string> {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
    return hash.digest('hex')
}

export function addToState(state: ModsState, mod: InstalledMod): ModsState {
    return { ...state, mods: [...state.mods.filter((m) => m.id !== mod.id), mod] }
}

export function removeFromState(state: ModsState, modId: number): ModsState {
    return { ...state, mods: state.mods.filter((m) => m.id !== modId) }
}

export function setEnabled(state: ModsState, modId: number, enabled: boolean): ModsState {
    return { ...state, mods: state.mods.map((m) => (m.id === modId ? { ...m, enabled } : m)) }
}

export function readState(statePath: string): ModsState {
    if (!existsSync(statePath)) return { folders: [], mods: [] }
    try {
        const parsed = JSON.parse(readFileSync(statePath, 'utf8'))
        return {
            folders: parsed.folders ?? [],
            mods: parsed.mods ?? [],
        }
    } catch {
        return { folders: [], mods: [] }
    }
}

function saveState(statePath: string, state: ModsState): void {
    writeFileSync(statePath, JSON.stringify(state, null, 4))
}

function getFolderDiskName(
    folders: ModFolder[],
    folderId: string | null | undefined
): string | null {
    if (!folderId) return null
    return folders.find((f) => f.id === folderId)?.diskName ?? null
}

export async function findUntrackedPaks(
    gamePath: string,
    knownRelPaths: Set<string>,
    folders: ModFolder[]
): Promise<{ relPath: string; enabled: boolean }[]> {
    const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
    try {
        await fsp.access(modsBak)
        return []
    } catch {}

    const modsDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledDir = join(modsDir, 'disabled')
    const untracked: { relPath: string; enabled: boolean }[] = []

    try {
        const entries = await fsp.readdir(modsDir, { withFileTypes: true })
        for (const entry of entries) {
            if (entry.name === 'disabled') continue
            if (entry.isDirectory()) {
                try {
                    const subEntries = await fsp.readdir(join(modsDir, entry.name))
                    for (const file of subEntries) {
                        if (!file.endsWith('.pak')) continue
                        const relPath = `${entry.name}/${file}`
                        if (!knownRelPaths.has(relPath)) {
                            untracked.push({ relPath, enabled: true })
                        }
                    }
                } catch {}
            } else if (entry.name.endsWith('.pak')) {
                if (!knownRelPaths.has(entry.name)) {
                    untracked.push({ relPath: entry.name, enabled: true })
                }
            }
        }
    } catch {}

    try {
        const disabledEntries = await fsp.readdir(disabledDir, { withFileTypes: true })
        for (const entry of disabledEntries) {
            if (entry.isDirectory()) {
                try {
                    const subEntries = await fsp.readdir(join(disabledDir, entry.name))
                    for (const file of subEntries) {
                        if (!file.endsWith('.pak.disabled')) continue
                        const pakFilename = file.slice(0, -'.disabled'.length)
                        const relPath = `${entry.name}/${pakFilename}`
                        if (!knownRelPaths.has(relPath)) {
                            untracked.push({ relPath, enabled: false })
                        }
                    }
                } catch {}
            } else if (entry.name.endsWith('.pak.disabled')) {
                const pakFilename = entry.name.slice(0, -'.disabled'.length)
                if (!knownRelPaths.has(pakFilename)) {
                    untracked.push({ relPath: pakFilename, enabled: false })
                }
            }
        }
    } catch {}

    return untracked
}

export async function reconcileState(gamePath: string, statePath: string): Promise<ModsState> {
    const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
    try {
        await fsp.access(modsBak)
        return readState(join(gamePath, 'PAYDAY3', 'Content', '~mods.bak', '.pd3mm.json'))
    } catch {}

    let state = readState(statePath)

    if (state.mods.some((m) => m.folderId === undefined)) {
        state = {
            ...state,
            mods: state.mods.map((m) => (m.folderId === undefined ? { ...m, folderId: null } : m)),
        }
    }

    const disabledDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
    for (const m of state.mods.filter((m) => !m.enabled)) {
        const folderDiskName = getFolderDiskName(state.folders, m.folderId)
        const newPath = disabledModPath(gamePath, m.filename, folderDiskName)
        const legacyPath = join(disabledDir, m.filename)
        try {
            await fsp.access(newPath)
        } catch {
            try {
                await fsp.access(legacyPath)
                if (folderDiskName) {
                    const subDir = join(disabledDir, folderDiskName)
                    if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true })
                }
                renameSync(legacyPath, newPath)
            } catch {}
        }
    }

    const checks = await Promise.all(
        state.mods.map(async (m) => {
            const folderDiskName = getFolderDiskName(state.folders, m.folderId)
            try {
                await fsp.access(activeModPath(gamePath, m.filename, folderDiskName))
                return true
            } catch {}
            try {
                await fsp.access(disabledModPath(gamePath, m.filename, folderDiskName))
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
        saveState(statePath, { ...state, mods: reconciled })
    }

    if (reconciled.some((m) => m.priority === undefined)) {
        const maxByFolder = new Map<string | null, number>()
        for (const m of reconciled) {
            if (m.priority !== undefined) {
                const key = m.folderId ?? null
                maxByFolder.set(key, Math.max(maxByFolder.get(key) ?? 0, m.priority))
            }
        }
        const migrated = reconciled.map((m) => {
            if (m.priority !== undefined) return m
            const key = m.folderId ?? null
            const next = (maxByFolder.get(key) ?? 0) + 1
            maxByFolder.set(key, next)
            return { ...m, priority: next }
        })
        saveState(statePath, { ...state, mods: migrated })
        return { folders: state.folders, mods: migrated }
    }

    return { folders: state.folders, mods: reconciled }
}

export function installMod(
    gamePath: string,
    statePath: string,
    mod: InstalledMod,
    sourcePath: string,
    folderId: string | null = null
): void {
    const state = readState(statePath)
    const folderDiskName = getFolderDiskName(state.folders, folderId)

    const modsDir = folderDiskName
        ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', folderDiskName)
        : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })

    const existing = state.mods.find((m) => m.id === mod.id)
    const modsInFolder = state.mods.filter((m) => (m.folderId ?? null) === folderId)
    const priority =
        existing?.priority ?? modsInFolder.reduce((max, m) => Math.max(max, m.priority ?? 0), 0) + 1
    const filename = applyPriorityPrefix(mod.filename, priority)

    copyFileSync(sourcePath, activeModPath(gamePath, filename, folderDiskName))

    if (existing && existing.filename !== filename) {
        const existingFolderDiskName = getFolderDiskName(state.folders, existing.folderId)
        const oldPath = existing.enabled
            ? activeModPath(gamePath, existing.filename, existingFolderDiskName)
            : disabledModPath(gamePath, existing.filename, existingFolderDiskName)
        if (existsSync(oldPath)) rmSync(oldPath, { force: true })
    }

    saveState(
        statePath,
        addToState(state, {
            ...mod,
            filename,
            priority,
            folderId,
            enabled: true,
            installedAt: new Date().toISOString(),
        })
    )
}

export function reorderModsInFolder(
    gamePath: string,
    statePath: string,
    folderId: string | null,
    orderedIds: number[]
): void {
    const state = readState(statePath)
    const folderDiskName = getFolderDiskName(state.folders, folderId)
    const total = orderedIds.length
    const updated = state.mods.map((mod) => {
        if ((mod.folderId ?? null) !== folderId) return mod
        const pos = orderedIds.indexOf(mod.id)
        if (pos === -1) return mod
        const priority = total - pos
        const newFilename = applyPriorityPrefix(mod.filename, priority)
        if (newFilename !== mod.filename) {
            const oldPath = mod.enabled
                ? activeModPath(gamePath, mod.filename, folderDiskName)
                : disabledModPath(gamePath, mod.filename, folderDiskName)
            const newPath = mod.enabled
                ? activeModPath(gamePath, newFilename, folderDiskName)
                : disabledModPath(gamePath, newFilename, folderDiskName)
            if (existsSync(oldPath)) renameSync(oldPath, newPath)
        }
        return { ...mod, filename: newFilename, priority }
    })
    saveState(statePath, { ...state, mods: updated })
}

export function moveModToFolder(
    gamePath: string,
    statePath: string,
    modId: number,
    targetFolderId: string | null,
    targetPosition: number
): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod) return

    const sourceFolderDiskName = getFolderDiskName(state.folders, mod.folderId)
    const targetFolderDiskName = getFolderDiskName(state.folders, targetFolderId)

    const targetMods = state.mods
        .filter((m) => (m.folderId ?? null) === targetFolderId && m.id !== modId)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    targetMods.splice(targetPosition, 0, mod)
    const total = targetMods.length

    if (targetFolderDiskName) {
        const activeTargetDir = join(
            gamePath,
            'PAYDAY3',
            'Content',
            'Paks',
            '~mods',
            targetFolderDiskName
        )
        if (!existsSync(activeTargetDir)) mkdirSync(activeTargetDir, { recursive: true })
    }
    if (!mod.enabled) {
        const disabledTargetDir = targetFolderDiskName
            ? join(
                  gamePath,
                  'PAYDAY3',
                  'Content',
                  'Paks',
                  '~mods',
                  'disabled',
                  targetFolderDiskName
              )
            : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
        if (!existsSync(disabledTargetDir)) mkdirSync(disabledTargetDir, { recursive: true })
    }

    const updatedMods = state.mods.map((m) => {
        const posInTarget = targetMods.findIndex((tm) => tm.id === m.id)
        if (posInTarget === -1) return m

        const priority = total - posInTarget
        const newFilename = applyPriorityPrefix(m.filename, priority)
        const currentFolderDiskName = m.id === modId ? sourceFolderDiskName : targetFolderDiskName

        if (
            newFilename !== m.filename ||
            (m.id === modId && sourceFolderDiskName !== targetFolderDiskName)
        ) {
            const oldPath = m.enabled
                ? activeModPath(gamePath, m.filename, currentFolderDiskName)
                : disabledModPath(gamePath, m.filename, currentFolderDiskName)
            const newPath = m.enabled
                ? activeModPath(gamePath, newFilename, targetFolderDiskName)
                : disabledModPath(gamePath, newFilename, targetFolderDiskName)
            if (existsSync(oldPath)) renameSync(oldPath, newPath)
        }

        return { ...m, filename: newFilename, priority, folderId: targetFolderId }
    })

    saveState(statePath, { ...state, mods: updatedMods })
}

export function reorderTopLevel(gamePath: string, statePath: string, items: TopLevelItem[]): void {
    const state = readState(statePath)
    const modsDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledDir = join(modsDir, 'disabled')
    const total = items.length

    const folderRenames: { folder: ModFolder; newDiskName: string }[] = []
    for (let pos = 0; pos < items.length; pos++) {
        const item = items[pos]
        if (item.type !== 'folder') continue
        const folder = state.folders.find((f) => f.id === item.id)
        if (!folder) continue
        const priority = total - pos
        const newDiskName = applyPriorityPrefix(stripPriorityPrefix(folder.diskName), priority)
        if (newDiskName !== folder.diskName) {
            folderRenames.push({ folder, newDiskName })
        }
    }

    // Two-phase rename to avoid conflicts: first to tmp, then to final
    for (const { folder } of folderRenames) {
        const tmpName = `__pd3mm_tmp_${folder.id}`
        const oldActive = join(modsDir, folder.diskName)
        if (existsSync(oldActive)) renameSync(oldActive, join(modsDir, tmpName))
        const oldDisabled = join(disabledDir, folder.diskName)
        if (existsSync(oldDisabled)) renameSync(oldDisabled, join(disabledDir, tmpName))
    }
    for (const { folder, newDiskName } of folderRenames) {
        const tmpName = `__pd3mm_tmp_${folder.id}`
        const tmpActive = join(modsDir, tmpName)
        if (existsSync(tmpActive)) renameSync(tmpActive, join(modsDir, newDiskName))
        const tmpDisabled = join(disabledDir, tmpName)
        if (existsSync(tmpDisabled)) renameSync(tmpDisabled, join(disabledDir, newDiskName))
    }

    const updatedFolders = state.folders.map((folder) => {
        const pos = items.findIndex((item) => item.type === 'folder' && item.id === folder.id)
        if (pos === -1) return folder
        const priority = total - pos
        const newDiskName = applyPriorityPrefix(stripPriorityPrefix(folder.diskName), priority)
        return { ...folder, diskName: newDiskName, priority }
    })

    const updatedMods = state.mods.map((mod) => {
        if ((mod.folderId ?? null) !== null) return mod
        const pos = items.findIndex((item) => item.type === 'mod' && item.id === mod.id)
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

    saveState(statePath, { folders: updatedFolders, mods: updatedMods })
}

export function createFolder(gamePath: string, statePath: string, displayName: string): ModFolder {
    const state = readState(statePath)
    const slug =
        displayName
            .toLowerCase()
            .trim()
            .replace(/[^\w]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'folder'

    const rootMods = state.mods.filter((m) => (m.folderId ?? null) === null)
    const maxPriority = Math.max(
        0,
        ...state.folders.map((f) => f.priority),
        ...rootMods.map((m) => m.priority ?? 0)
    )
    const priority = maxPriority + 1
    const diskName = applyPriorityPrefix(slug, priority)
    const id = randomUUID()

    const folderDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', diskName)
    if (!existsSync(folderDir)) mkdirSync(folderDir, { recursive: true })

    const folder: ModFolder = { id, diskName, displayName, priority }
    saveState(statePath, { ...state, folders: [...state.folders, folder] })
    return folder
}

export function renameFolder(
    _gamePath: string,
    statePath: string,
    folderId: string,
    displayName: string
): void {
    const state = readState(statePath)
    saveState(statePath, {
        ...state,
        folders: state.folders.map((f) => (f.id === folderId ? { ...f, displayName } : f)),
    })
}

export function deleteFolder(gamePath: string, statePath: string, folderId: string): void {
    const state = readState(statePath)
    const folder = state.folders.find((f) => f.id === folderId)
    if (!folder) return

    const rootMods = state.mods.filter((m) => (m.folderId ?? null) === null)
    let maxRootPriority = rootMods.reduce((max, m) => Math.max(max, m.priority ?? 0), 0)

    const updatedMods = state.mods.map((m) => {
        if ((m.folderId ?? null) !== folderId) return m
        maxRootPriority++
        const newFilename = applyPriorityPrefix(m.filename, maxRootPriority)
        const oldPath = m.enabled
            ? activeModPath(gamePath, m.filename, folder.diskName)
            : disabledModPath(gamePath, m.filename, folder.diskName)
        const newPath = m.enabled
            ? activeModPath(gamePath, newFilename)
            : disabledModPath(gamePath, newFilename)
        if (existsSync(oldPath)) renameSync(oldPath, newPath)
        return { ...m, filename: newFilename, priority: maxRootPriority, folderId: null }
    })

    const folderDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', folder.diskName)
    const disabledFolderDir = join(
        gamePath,
        'PAYDAY3',
        'Content',
        'Paks',
        '~mods',
        'disabled',
        folder.diskName
    )
    try {
        rmSync(folderDir)
    } catch {}
    try {
        rmSync(disabledFolderDir)
    } catch {}

    saveState(statePath, {
        folders: state.folders.filter((f) => f.id !== folderId),
        mods: updatedMods,
    })
}

export function uninstallMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod) return

    const folderDiskName = getFolderDiskName(state.folders, mod.folderId)
    const path = mod.enabled
        ? activeModPath(gamePath, mod.filename, folderDiskName)
        : disabledModPath(gamePath, mod.filename, folderDiskName)
    if (existsSync(path)) rmSync(path)

    saveState(statePath, removeFromState(state, modId))
}

export function enableMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod || mod.enabled) return

    const folderDiskName = getFolderDiskName(state.folders, mod.folderId)

    if (folderDiskName) {
        const activeDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', folderDiskName)
        if (!existsSync(activeDir)) mkdirSync(activeDir, { recursive: true })
    }

    const from = disabledModPath(gamePath, mod.filename, folderDiskName)
    if (existsSync(from)) renameSync(from, activeModPath(gamePath, mod.filename, folderDiskName))

    saveState(statePath, setEnabled(state, modId, true))
}

export function disableMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod || !mod.enabled) return

    const folderDiskName = getFolderDiskName(state.folders, mod.folderId)
    const disabledDir = folderDiskName
        ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', folderDiskName)
        : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
    if (!existsSync(disabledDir)) mkdirSync(disabledDir, { recursive: true })

    const from = activeModPath(gamePath, mod.filename, folderDiskName)
    if (existsSync(from)) renameSync(from, disabledModPath(gamePath, mod.filename, folderDiskName))

    saveState(statePath, setEnabled(state, modId, false))
}
