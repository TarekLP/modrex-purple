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
    installMod,
    uninstallMod,
    enableMod,
    disableMod,
    findUntrackedPaks,
    type InstalledMod,
    type ModsState,
} from './mods'

const fakeMod: InstalledMod = {
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
    it('places file under PAYDAY3/Content/Paks/~mods/disabled', () => {
        expect(disabledModPath('game', 'Mod.pak')).toBe(
            join('game', 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled', 'Mod.pak')
        )
    })
})

// --- state operations ---

describe('addToState', () => {
    it('adds mod to empty state', () => {
        const state = addToState({ mods: [] }, fakeMod)
        expect(state.mods).toHaveLength(1)
        expect(state.mods[0].id).toBe(1)
    })

    it('replaces existing mod with same id', () => {
        const state = addToState({ mods: [fakeMod] }, { ...fakeMod, version: '2.0' })
        expect(state.mods).toHaveLength(1)
        expect(state.mods[0].version).toBe('2.0')
    })
})

describe('removeFromState', () => {
    it('removes mod by id', () => {
        const state = removeFromState({ mods: [fakeMod] }, 1)
        expect(state.mods).toHaveLength(0)
    })

    it('does nothing for unknown id', () => {
        const state = removeFromState({ mods: [fakeMod] }, 99)
        expect(state.mods).toHaveLength(1)
    })
})

describe('setEnabled', () => {
    it('disables an enabled mod', () => {
        const state = setEnabled({ mods: [fakeMod] }, 1, false)
        expect(state.mods[0].enabled).toBe(false)
    })

    it('enables a disabled mod', () => {
        const state = setEnabled({ mods: [{ ...fakeMod, enabled: false }] }, 1, true)
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

describe('installMod', () => {
    it('copies pak to active mods folder', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        expect(existsSync(activeModPath(gamePath, fakeMod.filename))).toBe(true)
    })

    it('persists mod in state file', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        expect(existsSync(statePath)).toBe(true)
    })
})

describe('uninstallMod', () => {
    it('removes pak and clears state', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        uninstallMod(gamePath, statePath, 1)
        expect(existsSync(activeModPath(gamePath, fakeMod.filename))).toBe(false)
    })
})

describe('disableMod / enableMod', () => {
    it('moves pak to disabled folder on disable', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        disableMod(gamePath, statePath, 1)
        expect(existsSync(activeModPath(gamePath, fakeMod.filename))).toBe(false)
        expect(existsSync(disabledModPath(gamePath, fakeMod.filename))).toBe(true)
    })

    it('moves pak back to active folder on enable', () => {
        installMod(gamePath, statePath, fakeMod, sourceFile)
        disableMod(gamePath, statePath, 1)
        enableMod(gamePath, statePath, 1)
        expect(existsSync(activeModPath(gamePath, fakeMod.filename))).toBe(true)
        expect(existsSync(disabledModPath(gamePath, fakeMod.filename))).toBe(false)
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
        expect(await findUntrackedPaks(gamePath, new Set())).toEqual([])
    })

    it('returns empty array when ~mods.bak exists', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'SomeMod.pak'), '')
        mkdirSync(join(gamePath, 'PAYDAY3', 'Content'), { recursive: true })
        writeFileSync(modsBak(gamePath), '')
        expect(await findUntrackedPaks(gamePath, new Set())).toEqual([])
    })

    it('returns untracked pak from active dir as enabled', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'CoolMod.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set())
        expect(result).toEqual([{ filename: 'CoolMod.pak', enabled: true }])
    })

    it('returns untracked pak from disabled dir as disabled', async () => {
        mkdirSync(disabledDir(gamePath), { recursive: true })
        writeFileSync(join(disabledDir(gamePath), 'OldMod.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set())
        expect(result).toEqual([{ filename: 'OldMod.pak', enabled: false }])
    })

    it('skips known filenames', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'Known.pak'), '')
        writeFileSync(join(activeDir(gamePath), 'Unknown.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set(['Known.pak']))
        expect(result).toEqual([{ filename: 'Unknown.pak', enabled: true }])
    })

    it('ignores non-pak files', async () => {
        mkdirSync(activeDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'readme.txt'), '')
        writeFileSync(join(activeDir(gamePath), 'Mod.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set())
        expect(result).toHaveLength(1)
        expect(result[0].filename).toBe('Mod.pak')
    })

    it('returns paks from both active and disabled dirs', async () => {
        mkdirSync(disabledDir(gamePath), { recursive: true })
        writeFileSync(join(activeDir(gamePath), 'Active.pak'), '')
        writeFileSync(join(disabledDir(gamePath), 'Disabled.pak'), '')
        const result = await findUntrackedPaks(gamePath, new Set())
        expect(result).toHaveLength(2)
        expect(result.find((r) => r.filename === 'Active.pak')?.enabled).toBe(true)
        expect(result.find((r) => r.filename === 'Disabled.pak')?.enabled).toBe(false)
    })
})
