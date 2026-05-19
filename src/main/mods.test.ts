import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
    activeModPath,
    disabledModPath,
    addToState,
    removeFromState,
    setEnabled,
    readState,
    installMod,
    uninstallMod,
    enableMod,
    disableMod,
    reorderModsInFolder,
    findUntrackedPaks,
    reconcileState,
    computeSha256,
    type InstalledMod,
    type ModsState,
} from './mods'

const fakeMod: InstalledMod = {
    uid: 'TestMod.pak',
    id: 1,
    name: 'TestMod',
    version: '1.0',
    filename: 'TestMod.pak',
    enabled: true,
    installedAt: '2026-01-01T00:00:00.000Z',
}

// --- path calculations ---

describe('activeModPath', () => {
    it('places file under PAYDAY3/Content/Paks/~mods', () => {
        expect(activeModPath('game', 'Mod.pak')).toBe(
            join('game', 'PAYDAY3', 'Content', 'Paks', '~mods', 'Mod.pak')
        )
    })
})

describe('disabledModPath', () => {
    it('places file under PAYDAY3/Content/Paks/~mods/disabled with .disabled extension', () => {
        expect(disabledModPath('game', 'Mod.pak')).toBe(
            join('game', 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', 'Mod.pak.disabled')
        )
    })
})

// --- state operations ---

const emptyState: ModsState = { folders: [], mods: [] }

describe('addToState', () => {
    it('adds mod to empty state', () => {
        const state = addToState(emptyState, fakeMod)
        expect(state.mods).toHaveLength(1)
        expect(state.mods[0].id).toBe(1)
    })

    it('replaces existing mod with same uid', () => {
        const state = addToState({ folders: [], mods: [fakeMod] }, { ...fakeMod, version: '2.0' })
        expect(state.mods).toHaveLength(1)
        expect(state.mods[0].version).toBe('2.0')
    })
})

describe('removeFromState', () => {
    it('removes mod by uid', () => {
        const state = removeFromState({ folders: [], mods: [fakeMod] }, fakeMod.uid)
        expect(state.mods).toHaveLength(0)
    })

    it('does nothing for unknown uid', () => {
        const state = removeFromState({ folders: [], mods: [fakeMod] }, 'nonexistent-uid')
        expect(state.mods).toHaveLength(1)
    })
})

describe('setEnabled', () => {
    it('disables an enabled mod', () => {
        const state = setEnabled({ folders: [], mods: [fakeMod] }, fakeMod.uid, false)
        expect(state.mods[0].enabled).toBe(false)
    })

    it('enables a disabled mod', () => {
        const state = setEnabled(
            { folders: [], mods: [{ ...fakeMod, enabled: false }] },
            fakeMod.uid,
            true
        )
        expect(state.mods[0].enabled).toBe(true)
    })
})

// --- file operations ---

let tmp: string
let gamePath: string
let statePath: string
let sourceFile: string

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'pd3-test-'))
    gamePath = join(tmp, 'game')
    statePath = join(tmp, 'state.json')
    sourceFile = join(tmp, 'TestMod.pak')
    writeFileSync(sourceFile, 'fake pak content')
})

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
})

describe('computeSha256', () => {
    it('returns a 64-char lowercase hex string', async () => {
        const hash = await computeSha256(sourceFile)
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('returns the same hash for identical content', async () => {
        const copy = join(tmp, 'copy.pak')
        writeFileSync(copy, 'fake pak content')
        expect(await computeSha256(sourceFile)).toBe(await computeSha256(copy))
    })

    it('returns different hashes for different content', async () => {
        const other = join(tmp, 'other.pak')
        writeFileSync(other, 'different content')
        expect(await computeSha256(sourceFile)).not.toBe(await computeSha256(other))
    })
})

describe('installMod', () => {
    it('copies pak to active mods folder with priority prefix', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const { mods } = readState(statePath)
        expect(mods[0].filename).toBe('001_TestMod.pak')
        expect(existsSync(activeModPath(gamePath, mods[0].filename))).toBe(true)
    })

    it('persists mod in state file', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        expect(existsSync(statePath)).toBe(true)
    })

    it('assigns priority 1 to first mod', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        expect(readState(statePath).mods[0].priority).toBe(1)
    })

    it('stores sha256 in state when provided', () => {
        installMod(gamePath, statePath, { ...fakeMod, sha256: 'abc123' }, sourceFile)
        expect(readState(statePath).mods[0].sha256).toBe('abc123')
    })

    it('assigns incrementing priority to subsequent mods', () => {
        const fakeMod2: InstalledMod = {
            ...fakeMod,
            uid: 'TestMod2.pak',
            id: 2,
            name: 'TestMod2',
            filename: 'TestMod2.pak',
        }
        installMod(gamePath, statePath, fakeMod, sourceFile)
        installMod(gamePath, statePath, fakeMod2, sourceFile)
        const { mods } = readState(statePath)
        const priorities = mods.map((m) => m.priority).sort((a, b) => (a ?? 0) - (b ?? 0))
        expect(priorities).toEqual([1, 2])
    })
})

describe('uninstallMod', () => {
    it('removes pak and clears state', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const { uid, filename } = readState(statePath).mods[0]
        uninstallMod(gamePath, statePath, uid)
        expect(existsSync(activeModPath(gamePath, filename))).toBe(false)
        expect(readState(statePath).mods).toHaveLength(0)
    })
})

describe('disableMod / enableMod', () => {
    it('moves pak to disabled folder on disable', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const { uid, filename } = readState(statePath).mods[0]
        disableMod(gamePath, statePath, uid)
        expect(existsSync(activeModPath(gamePath, filename))).toBe(false)
        expect(existsSync(disabledModPath(gamePath, filename))).toBe(true)
    })

    it('moves pak back to active folder on enable', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const { uid, filename } = readState(statePath).mods[0]
        disableMod(gamePath, statePath, uid)
        enableMod(gamePath, statePath, uid)
        expect(existsSync(activeModPath(gamePath, filename))).toBe(true)
        expect(existsSync(disabledModPath(gamePath, filename))).toBe(false)
    })
})

// --- reconcileState ---

describe('reconcileState', () => {
    it('marks mod as missing when pak file is gone', async () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const { mods } = readState(statePath)
        rmSync(activeModPath(gamePath, mods[0].filename))

        const result = await reconcileState(gamePath, statePath)
        expect(result.mods).toHaveLength(1)
        expect(result.mods[0].missing).toBe(true)
    })

    it('clears missing flag when pak file is restored', async () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const { mods } = readState(statePath)
        const pakPath = activeModPath(gamePath, mods[0].filename)
        rmSync(pakPath)

        await reconcileState(gamePath, statePath)

        writeFileSync(pakPath, 'fake pak content')
        const result = await reconcileState(gamePath, statePath)
        expect(result.mods[0].missing).toBeUndefined()
    })

    it('keeps missing mod in state instead of dropping it', async () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const { mods } = readState(statePath)
        rmSync(activeModPath(gamePath, mods[0].filename))

        const result = await reconcileState(gamePath, statePath)
        expect(result.mods).toHaveLength(1)
        expect(result.mods[0].id).toBe(fakeMod.id)
    })

    it('migrates disabled mod from legacy .pak to .pak.disabled format', async () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const filename = readState(statePath).mods[0].filename

        // simulate legacy state: file sitting in disabled/ as plain .pak
        const disabledDirPath = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
        mkdirSync(disabledDirPath, { recursive: true })
        rmSync(activeModPath(gamePath, filename))
        writeFileSync(join(disabledDirPath, filename), 'fake pak')
        const raw = readState(statePath)
        writeFileSync(
            statePath,
            JSON.stringify({ mods: raw.mods.map((m) => ({ ...m, enabled: false })) }, null, 4)
        )

        await reconcileState(gamePath, statePath)

        expect(existsSync(join(disabledDirPath, filename))).toBe(false)
        expect(existsSync(disabledModPath(gamePath, filename))).toBe(true)
    })
})

// --- readState error handling ---

describe('readState', () => {
    it('returns empty state when file does not exist', () => {
        expect(readState(join(tmp, 'nonexistent.json'))).toEqual({ folders: [], mods: [] })
    })

    it('returns empty state when file contains invalid JSON', () => {
        const corrupt = join(tmp, 'corrupt.json')
        writeFileSync(corrupt, '{ this is not valid json }{{{')
        expect(readState(corrupt)).toEqual({ folders: [], mods: [] })
    })

    it('returns empty state when file is empty', () => {
        const empty = join(tmp, 'empty.json')
        writeFileSync(empty, '')
        expect(readState(empty)).toEqual({ folders: [], mods: [] })
    })
})

// --- installMod edge cases ---

describe('installMod priority preservation', () => {
    it('preserves priority when reinstalling an existing mod', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const before = readState(statePath).mods[0].priority

        installMod(gamePath, statePath, fakeMod, sourceFile)
        const after = readState(statePath).mods[0].priority

        expect(after).toBe(before)
    })
})

// --- uninstallMod edge cases ---

describe('uninstallMod', () => {
    it('does nothing when uid does not exist in state', () => {
        expect(() => uninstallMod(gamePath, statePath, 'nonexistent-uid')).not.toThrow()
    })
})

// --- reorderMods ---

describe('reorderModsInFolder', () => {
    it('reassigns priorities based on order (index 0 = highest priority)', () => {
        const mod2: InstalledMod = {
            ...fakeMod,
            uid: 'Mod2.pak',
            id: 2,
            name: 'Mod2',
            filename: 'Mod2.pak',
        }
        installMod(gamePath, statePath, fakeMod, sourceFile)
        writeFileSync(join(tmp, 'Mod2.pak'), 'fake')
        installMod(gamePath, statePath, mod2, join(tmp, 'Mod2.pak'))

        const { mods } = readState(statePath)
        const uids = mods.map((m) => m.uid)
        reorderModsInFolder(gamePath, statePath, null, uids)

        const reordered = readState(statePath).mods
        const first = reordered.find((m) => m.uid === uids[0])!
        const second = reordered.find((m) => m.uid === uids[1])!
        expect(first.priority).toBeGreaterThan(second.priority!)
    })

    it('renames pak files on disk to reflect new priority prefix', () => {
        const mod2: InstalledMod = {
            ...fakeMod,
            uid: 'Mod2.pak',
            id: 2,
            name: 'Mod2',
            filename: 'Mod2.pak',
        }
        installMod(gamePath, statePath, fakeMod, sourceFile)
        writeFileSync(join(tmp, 'Mod2.pak'), 'fake')
        installMod(gamePath, statePath, mod2, join(tmp, 'Mod2.pak'))

        const before = readState(statePath).mods
        reorderModsInFolder(gamePath, statePath, null, [before[1].uid, before[0].uid])

        const after = readState(statePath).mods
        for (const m of after) {
            expect(existsSync(activeModPath(gamePath, m.filename))).toBe(true)
        }
    })
})

// --- reconcileState priority migration ---

describe('reconcileState priority migration', () => {
    it('assigns sequential priorities to mods missing the priority field', async () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        const raw = readState(statePath)
        const stripped = { mods: raw.mods.map(({ priority: _, ...m }) => m) }
        writeFileSync(statePath, JSON.stringify(stripped, null, 4))

        const result = await reconcileState(gamePath, statePath)
        expect(result.mods[0].priority).toBeDefined()
        expect(result.mods[0].priority).toBeGreaterThan(0)
    })
})

// --- findUntrackedPaks ---

describe('findUntrackedPaks', () => {
    function activeDir(gp: string) {
        return join(gp, 'PAYDAY3', 'Content', 'Paks', '~mods')
    }
    function disabledDir(gp: string) {
        return join(gp, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')
    }
    function modsBak(gp: string) {
        return join(gp, 'PAYDAY3', 'Content', '~mods.bak')
    }

    it('returns empty array when ~mods dir does not exist', async () => {
        expect(await findUntrackedPaks(gamePath, new Set(), [])).toEqual([])
    })

    it('returns empty array when ~mods.bak exists', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'SomeMod.pak'), '')
        mkdirSync(join(gamePath, 'PAYDAY3', 'Content'), { recursive: true })
        writeFileSync(modsBak(gamePath), '')
        expect(await findUntrackedPaks(gamePath, new Set(), [])).toEqual([])
    })

    it('returns untracked pak from active dir as enabled', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'CoolMod.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set(), [])
        expect(result).toEqual([{ relPath: 'CoolMod.pak', enabled: true }])
    })

    it('returns untracked pak from disabled dir as disabled', async () => {
        mkdirSync(disabledDir(gamePath), { recursive: true })
        writeFileSync(join(disabledDir(gamePath), 'OldMod.pak.disabled'), '')
        const result = await findUntrackedPaks(gamePath, new Set(), [])
        expect(result).toEqual([{ relPath: 'OldMod.pak', enabled: false }])
    })

    it('skips known relative paths', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'Known.pak'), '')
        writeFileSync(join(activeDir(gamePath), 'Unknown.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set(['Known.pak']), [])
        expect(result).toEqual([{ relPath: 'Unknown.pak', enabled: true }])
    })

    it('ignores non-pak files', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'readme.txt'), '')
        writeFileSync(join(activeDir(gamePath), 'Mod.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set(), [])
        expect(result).toHaveLength(1)
        expect(result[0].relPath).toBe('Mod.pak')
    })

    it('returns paks from both active and disabled dirs', async () => {
        mkdirSync(disabledDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'Active.pak'), '')
        writeFileSync(join(disabledDir(gamePath), 'Disabled.pak.disabled'), '')
        const result = await findUntrackedPaks(gamePath, new Set(), [])
        expect(result).toHaveLength(2)
        expect(result.find((r) => r.relPath === 'Active.pak')?.enabled).toBe(true)
        expect(result.find((r) => r.relPath === 'Disabled.pak')?.enabled).toBe(false)
    })
})
