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
    folderRelPath?: string | null
): string {
    if (folderRelPath) {
        return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', folderRelPath, filename)
    }
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', filename)
}

export function disabledModPath(
    gamePath: string,
    filename: string,
    folderRelPath?: string | null
): string {
    if (folderRelPath) {
        return join(
            gamePath,
            'PAYDAY3',
            'Content',
            'Paks',
            '~mods',
            'disabled',
            folderRelPath,
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
            folders: (parsed.folders ?? []).map((f: Record<string, unknown>) => ({
                parentId: null,
                ...f,
            })),
            mods: parsed.mods ?? [],
        }
    } catch {
        return { folders: [], mods: [] }
    }
}

function saveState(statePath: string, state: ModsState): void {
    writeFileSync(statePath, JSON.stringify(state, null, 4))
}

// Returns the full slash-separated path relative to ~mods/ for a folder, e.g. '001_weapons/002_rifles'.
export function getFolderPath(
    folders: ModFolder[],
    folderId: string | null | undefined
): string | null {
    if (!folderId) return null
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return null
    const parentPath = getFolderPath(folders, folder.parentId)
    return parentPath ? `${parentPath}/${folder.diskName}` : folder.diskName
}

export async function findUntrackedPaks(
    gamePath: string,
    knownRelPaths: Set<string>,
    _folders: ModFolder[]
): Promise<{ relPath: string; enabled: boolean }[]> {
    const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
    try {
        await fsp.access(modsBak)
        return []
    } catch {}

    const modsDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledDir = join(modsDir, 'disabled')
    const untracked: { relPath: string; enabled: boolean }[] = []

    async function scanActive(dir: string, prefix: string): Promise<void> {
        let entries
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            if (prefix === '' && entry.name === 'disabled') continue
            if (entry.isDirectory()) {
                const sub = prefix ? `${prefix}/${entry.name}` : entry.name
                await scanActive(join(dir, entry.name), sub)
            } else if (entry.name.endsWith('.pak')) {
                const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
                if (!knownRelPaths.has(relPath)) untracked.push({ relPath, enabled: true })
            }
        }
    }

    async function scanDisabled(dir: string, prefix: string): Promise<void> {
        let entries
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const sub = prefix ? `${prefix}/${entry.name}` : entry.name
                await scanDisabled(join(dir, entry.name), sub)
            } else if (entry.name.endsWith('.pak.disabled')) {
                const pakFilename = entry.name.slice(0, -'.disabled'.length)
                const relPath = prefix ? `${prefix}/${pakFilename}` : pakFilename
                if (!knownRelPaths.has(relPath)) untracked.push({ relPath, enabled: false })
            }
        }
    }

    await scanActive(modsDir, '')
    await scanDisabled(disabledDir, '')
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
        const folderRelPath = getFolderPath(state.folders, m.folderId)
        const newPath = disabledModPath(gamePath, m.filename, folderRelPath)
        const legacyPath = join(disabledDir, m.filename)
        try {
            await fsp.access(newPath)
        } catch {
            try {
                await fsp.access(legacyPath)
                if (folderRelPath) {
                    const subDir = join(disabledDir, folderRelPath)
                    if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true })
                }
                renameSync(legacyPath, newPath)
            } catch {}
        }
    }

    const checks = await Promise.all(
        state.mods.map(async (m) => {
            const folderRelPath = getFolderPath(state.folders, m.folderId)
            try {
                await fsp.access(activeModPath(gamePath, m.filename, folderRelPath))
                return true
            } catch {}
            try {
                await fsp.access(disabledModPath(gamePath, m.filename, folderRelPath))
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
    const folderRelPath = getFolderPath(state.folders, folderId)

    const modsDir = folderRelPath
        ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', folderRelPath)
        : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })

    const existing = state.mods.find((m) => m.id === mod.id)
    const modsInFolder = state.mods.filter((m) => (m.folderId ?? null) === folderId)
    const priority =
        existing?.priority ?? modsInFolder.reduce((max, m) => Math.max(max, m.priority ?? 0), 0) + 1
    const filename = applyPriorityPrefix(mod.filename, priority)

    copyFileSync(sourcePath, activeModPath(gamePath, filename, folderRelPath))

    if (existing && existing.filename !== filename) {
        const existingFolderRelPath = getFolderPath(state.folders, existing.folderId)
        const oldPath = existing.enabled
            ? activeModPath(gamePath, existing.filename, existingFolderRelPath)
            : disabledModPath(gamePath, existing.filename, existingFolderRelPath)
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
    const folderRelPath = getFolderPath(state.folders, folderId)
    const total = orderedIds.length
    const updated = state.mods.map((mod) => {
        if ((mod.folderId ?? null) !== folderId) return mod
        const pos = orderedIds.indexOf(mod.id)
        if (pos === -1) return mod
        const priority = total - pos
        const newFilename = applyPriorityPrefix(mod.filename, priority)
        if (newFilename !== mod.filename) {
            const oldPath = mod.enabled
                ? activeModPath(gamePath, mod.filename, folderRelPath)
                : disabledModPath(gamePath, mod.filename, folderRelPath)
            const newPath = mod.enabled
                ? activeModPath(gamePath, newFilename, folderRelPath)
                : disabledModPath(gamePath, newFilename, folderRelPath)
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

    const sourceFolderRelPath = getFolderPath(state.folders, mod.folderId)
    const targetFolderRelPath = getFolderPath(state.folders, targetFolderId)

    const targetMods = state.mods
        .filter((m) => (m.folderId ?? null) === targetFolderId && m.id !== modId)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    targetMods.splice(targetPosition, 0, mod)
    const total = targetMods.length

    if (targetFolderRelPath) {
        const activeTargetDir = join(
            gamePath,
            'PAYDAY3',
            'Content',
            'Paks',
            '~mods',
            targetFolderRelPath
        )
        if (!existsSync(activeTargetDir)) mkdirSync(activeTargetDir, { recursive: true })
    }
    if (!mod.enabled) {
        const disabledTargetDir = targetFolderRelPath
            ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', targetFolderRelPath)
            : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
        if (!existsSync(disabledTargetDir)) mkdirSync(disabledTargetDir, { recursive: true })
    }

    const updatedMods = state.mods.map((m) => {
        const posInTarget = targetMods.findIndex((tm) => tm.id === m.id)
        if (posInTarget === -1) return m

        const priority = total - posInTarget
        const newFilename = applyPriorityPrefix(m.filename, priority)
        const currentFolderRelPath = m.id === modId ? sourceFolderRelPath : targetFolderRelPath

        if (
            newFilename !== m.filename ||
            (m.id === modId && sourceFolderRelPath !== targetFolderRelPath)
        ) {
            const oldPath = m.enabled
                ? activeModPath(gamePath, m.filename, currentFolderRelPath)
                : disabledModPath(gamePath, m.filename, currentFolderRelPath)
            const newPath = m.enabled
                ? activeModPath(gamePath, newFilename, targetFolderRelPath)
                : disabledModPath(gamePath, newFilename, targetFolderRelPath)
            if (existsSync(oldPath)) renameSync(oldPath, newPath)
        }

        return { ...m, filename: newFilename, priority, folderId: targetFolderId }
    })

    saveState(statePath, { ...state, mods: updatedMods })
}

// parentId=null means root level.
export function reorderChildren(
    gamePath: string,
    statePath: string,
    parentId: string | null,
    items: TopLevelItem[]
): void {
    const state = readState(statePath)
    const parentRelPath = getFolderPath(state.folders, parentId)
    const modsDir = parentRelPath
        ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', parentRelPath)
        : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledDir = parentRelPath
        ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', parentRelPath)
        : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
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

    // Two-phase rename to avoid conflicts
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
        if ((mod.folderId ?? null) !== parentId) return mod
        const pos = items.findIndex((item) => item.type === 'mod' && item.id === mod.id)
        if (pos === -1) return mod
        const priority = total - pos
        const newFilename = applyPriorityPrefix(mod.filename, priority)
        if (newFilename !== mod.filename) {
            const modFolderRelPath = getFolderPath(state.folders, mod.folderId)
            const oldPath = mod.enabled
                ? activeModPath(gamePath, mod.filename, modFolderRelPath)
                : disabledModPath(gamePath, mod.filename, modFolderRelPath)
            const newPath = mod.enabled
                ? activeModPath(gamePath, newFilename, modFolderRelPath)
                : disabledModPath(gamePath, newFilename, modFolderRelPath)
            if (existsSync(oldPath)) renameSync(oldPath, newPath)
        }
        return { ...mod, filename: newFilename, priority }
    })

    saveState(statePath, { folders: updatedFolders, mods: updatedMods })
}

export function createFolder(
    gamePath: string,
    statePath: string,
    displayName: string,
    parentId: string | null = null
): ModFolder {
    const state = readState(statePath)
    const slug =
        displayName
            .toLowerCase()
            .trim()
            .replace(/[^\w]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'folder'

    const siblingMods = state.mods.filter((m) => (m.folderId ?? null) === parentId)
    const siblingFolders = state.folders.filter((f) => f.parentId === parentId)
    const maxPriority = Math.max(
        0,
        ...siblingFolders.map((f) => f.priority),
        ...siblingMods.map((m) => m.priority ?? 0)
    )
    const priority = maxPriority + 1
    const diskName = applyPriorityPrefix(slug, priority)
    const id = randomUUID()

    const parentRelPath = getFolderPath(state.folders, parentId)
    const folderDir = parentRelPath
        ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', parentRelPath, diskName)
        : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', diskName)
    if (!existsSync(folderDir)) mkdirSync(folderDir, { recursive: true })

    const folder: ModFolder = { id, diskName, displayName, priority, parentId }
    saveState(statePath, { ...state, folders: [...state.folders, folder] })
    return folder
}

export function moveFolder(
    gamePath: string,
    statePath: string,
    folderId: string,
    targetParentId: string | null
): void {
    const state = readState(statePath)
    const folder = state.folders.find((f) => f.id === folderId)
    if (!folder || folder.parentId === targetParentId) return

    // Cycle detection
    let cur: string | null = targetParentId
    while (cur !== null) {
        if (cur === folderId) return
        cur = state.folders.find((f) => f.id === cur)?.parentId ?? null
    }

    const modsBase = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledBase = join(modsBase, 'disabled')
    const oldRelPath = getFolderPath(state.folders, folderId)!

    const maxPriority = Math.max(
        0,
        ...state.folders.filter((f) => f.parentId === targetParentId).map((f) => f.priority),
        ...state.mods
            .filter((m) => (m.folderId ?? null) === targetParentId)
            .map((m) => m.priority ?? 0)
    )
    const newPriority = maxPriority + 1
    const newDiskName = applyPriorityPrefix(stripPriorityPrefix(folder.diskName), newPriority)

    const updatedFolders = state.folders.map((f) =>
        f.id === folderId
            ? { ...f, parentId: targetParentId, diskName: newDiskName, priority: newPriority }
            : f
    )
    const newRelPath = getFolderPath(updatedFolders, folderId)!

    const targetParentRelPath = getFolderPath(state.folders, targetParentId)
    const activeTargetParent = targetParentRelPath ? join(modsBase, targetParentRelPath) : modsBase
    const disabledTargetParent = targetParentRelPath
        ? join(disabledBase, targetParentRelPath)
        : disabledBase

    const oldActive = join(modsBase, oldRelPath)
    const newActive = join(modsBase, newRelPath)
    if (existsSync(oldActive)) {
        if (!existsSync(activeTargetParent)) mkdirSync(activeTargetParent, { recursive: true })
        renameSync(oldActive, newActive)
    }

    const oldDisabled = join(disabledBase, oldRelPath)
    const newDisabled = join(disabledBase, newRelPath)
    if (existsSync(oldDisabled)) {
        if (!existsSync(disabledTargetParent)) mkdirSync(disabledTargetParent, { recursive: true })
        renameSync(oldDisabled, newDisabled)
    }

    saveState(statePath, { ...state, folders: updatedFolders })
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

    const targetParentId = folder.parentId
    const folderRelPath = getFolderPath(state.folders, folderId)!
    const targetParentRelPath = getFolderPath(state.folders, targetParentId)

    const modsBase = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledBase = join(modsBase, 'disabled')

    // Ensure target parent dirs exist before moving content there
    if (targetParentRelPath) {
        const targetActiveDir = join(modsBase, targetParentRelPath)
        if (!existsSync(targetActiveDir)) mkdirSync(targetActiveDir, { recursive: true })
    }

    let maxPriority = Math.max(
        0,
        ...state.folders
            .filter((f) => f.parentId === targetParentId && f.id !== folderId)
            .map((f) => f.priority),
        ...state.mods
            .filter((m) => (m.folderId ?? null) === targetParentId)
            .map((m) => m.priority ?? 0)
    )

    // Move direct child mods to target parent
    const updatedMods = state.mods.map((m) => {
        if ((m.folderId ?? null) !== folderId) return m
        maxPriority++
        const newFilename = applyPriorityPrefix(m.filename, maxPriority)
        const oldPath = m.enabled
            ? activeModPath(gamePath, m.filename, folderRelPath)
            : disabledModPath(gamePath, m.filename, folderRelPath)
        const newPath = m.enabled
            ? activeModPath(gamePath, newFilename, targetParentRelPath)
            : disabledModPath(gamePath, newFilename, targetParentRelPath)
        if (existsSync(oldPath)) renameSync(oldPath, newPath)
        return { ...m, filename: newFilename, priority: maxPriority, folderId: targetParentId }
    })

    // Move direct child folders to target parent
    const childFolders = state.folders.filter((f) => f.parentId === folderId)
    const updatedChildFolders = childFolders.map((cf) => {
        maxPriority++
        const newDiskName = applyPriorityPrefix(stripPriorityPrefix(cf.diskName), maxPriority)
        const oldCfRelPath = getFolderPath(state.folders, cf.id)!
        const oldActive = join(modsBase, oldCfRelPath)
        const newActive = targetParentRelPath
            ? join(modsBase, targetParentRelPath, newDiskName)
            : join(modsBase, newDiskName)
        if (existsSync(oldActive)) renameSync(oldActive, newActive)
        const oldDisabled = join(disabledBase, oldCfRelPath)
        const newDisabled = targetParentRelPath
            ? join(disabledBase, targetParentRelPath, newDiskName)
            : join(disabledBase, newDiskName)
        if (existsSync(oldDisabled)) renameSync(oldDisabled, newDisabled)
        return { ...cf, parentId: targetParentId, diskName: newDiskName, priority: maxPriority }
    })

    // Clean up the now-empty folder directories
    try {
        rmSync(join(modsBase, folderRelPath), { recursive: true, force: true })
    } catch {}
    try {
        rmSync(join(disabledBase, folderRelPath), { recursive: true, force: true })
    } catch {}

    const childFolderIdSet = new Set(childFolders.map((f) => f.id))
    const updatedFolders = state.folders
        .filter((f) => f.id !== folderId)
        .map((f) => updatedChildFolders.find((uf) => uf.id === f.id) ?? f)

    saveState(statePath, { folders: updatedFolders, mods: updatedMods })
}

export function uninstallMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod) return

    const folderRelPath = getFolderPath(state.folders, mod.folderId)
    const path = mod.enabled
        ? activeModPath(gamePath, mod.filename, folderRelPath)
        : disabledModPath(gamePath, mod.filename, folderRelPath)
    if (existsSync(path)) rmSync(path)

    saveState(statePath, removeFromState(state, modId))
}

export function enableMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod || mod.enabled) return

    const folderRelPath = getFolderPath(state.folders, mod.folderId)

    if (folderRelPath) {
        const activeDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', folderRelPath)
        if (!existsSync(activeDir)) mkdirSync(activeDir, { recursive: true })
    }

    const from = disabledModPath(gamePath, mod.filename, folderRelPath)
    if (existsSync(from)) renameSync(from, activeModPath(gamePath, mod.filename, folderRelPath))

    saveState(statePath, setEnabled(state, modId, true))
}

export function disableMod(gamePath: string, statePath: string, modId: number): void {
    const state = readState(statePath)
    const mod = state.mods.find((m) => m.id === modId)
    if (!mod || !mod.enabled) return

    const folderRelPath = getFolderPath(state.folders, mod.folderId)
    const disabledDir = folderRelPath
        ? join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', folderRelPath)
        : join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
    if (!existsSync(disabledDir)) mkdirSync(disabledDir, { recursive: true })

    const from = activeModPath(gamePath, mod.filename, folderRelPath)
    if (existsSync(from)) renameSync(from, disabledModPath(gamePath, mod.filename, folderRelPath))

    saveState(statePath, setEnabled(state, modId, false))
}
