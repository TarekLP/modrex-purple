import { describe, it, expect } from 'vitest'
import type { InstalledMod, ModFolder } from '../../../shared/types'
import {
    syntheticMod,
    getAllModsInFolder,
    filterInstalled,
    normalizeModScopes,
    computeChildren,
    groupChildren,
    type ChildEntry,
    type ChildGroup,
} from './installedUtils'

function makeMod(
    uid: string,
    id: number,
    name: string,
    overrides: Partial<InstalledMod> = {}
): InstalledMod {
    return {
        uid,
        id,
        name,
        version: '1.0',
        filename: `${uid}.pak`,
        enabled: true,
        installedAt: '2024-01-01T00:00:00Z',
        folderId: null,
        priority: 0,
        ...overrides,
    }
}

function makeFolder(id: string, overrides: Partial<ModFolder> = {}): ModFolder {
    return {
        id,
        diskName: id,
        displayName: id,
        priority: 0,
        parentId: null,
        ...overrides,
    }
}

describe('syntheticMod', () => {
    it('maps id, name, and version from the installed mod', () => {
        const ins = makeMod('uid1', 42, 'Cool Mod', { version: '2.5' })
        const result = syntheticMod(ins)
        expect(result.id).toBe(42)
        expect(result.name).toBe('Cool Mod')
        expect(result.version).toBe('2.5')
    })

    it('sets fixed fallback values for all remote-only fields', () => {
        const ins = makeMod('uid1', 1, 'Mod')
        const result = syntheticMod(ins)
        expect(result.desc).toBe('')
        expect(result.short_desc).toBe('Manually installed — not on modworkshop')
        expect(result.downloads).toBe(0)
        expect(result.likes).toBe(0)
        expect(result.views).toBe(0)
        expect(result.has_download).toBe(false)
        expect(result.thumbnail).toBeNull()
        expect(result.download).toBeNull()
        expect(result.user).toEqual({ name: 'Unknown' })
    })

    it('uses installedAt for both published_at and bumped_at', () => {
        const ins = makeMod('uid1', 1, 'Mod', { installedAt: '2025-06-01T12:00:00Z' })
        const result = syntheticMod(ins)
        expect(result.published_at).toBe('2025-06-01T12:00:00Z')
        expect(result.bumped_at).toBe('2025-06-01T12:00:00Z')
    })
})

describe('getAllModsInFolder', () => {
    it('returns direct mods in the folder', () => {
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 2, 'B', { folderId: 'f1' }),
            makeMod('c', 3, 'C', { folderId: null }),
        ]
        const result = getAllModsInFolder(mods, [], 'f1')
        expect(result).toHaveLength(2)
        expect(result.map((m) => m.uid)).toEqual(expect.arrayContaining(['a', 'b']))
    })

    it('recursively includes mods in nested subfolders', () => {
        const folders = [makeFolder('f1'), makeFolder('f2', { parentId: 'f1' })]
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 2, 'B', { folderId: 'f2' }),
        ]
        const result = getAllModsInFolder(mods, folders, 'f1')
        expect(result.map((m) => m.uid)).toEqual(expect.arrayContaining(['a', 'b']))
    })

    it('returns empty array for a folder that has no mods', () => {
        const folders = [makeFolder('f1')]
        expect(getAllModsInFolder([], folders, 'f1')).toEqual([])
    })

    it('does not include mods from sibling folders', () => {
        const mods = [makeMod('a', 1, 'A', { folderId: 'f2' })]
        const result = getAllModsInFolder(mods, [makeFolder('f2')], 'f1')
        expect(result).toEqual([])
    })

    it('does not include root-level mods when querying a specific folder', () => {
        const mods = [makeMod('a', 1, 'A', { folderId: null })]
        expect(getAllModsInFolder(mods, [], 'f1')).toEqual([])
    })
})

describe('filterInstalled', () => {
    const folders = [makeFolder('parent'), makeFolder('child', { parentId: 'parent' })]
    const mods = [
        makeMod('a', 1, 'Crimson Heist', { folderId: 'child' }),
        makeMod('b', 2, 'Blue Storm', { folderId: null }),
        makeMod('c', 3, 'Alpha Mod', { folderId: null }),
    ]

    it('returns mods matching query case-insensitively', () => {
        const { mods: result } = filterInstalled(mods, folders, 'crimson')
        expect(result).toHaveLength(1)
        expect(result[0].uid).toBe('a')
    })

    it('matches substring anywhere in the name', () => {
        // 'e' appears in 'Crimson H[e]ist' and 'Blu[e] Storm' but not 'Alpha Mod'
        const { mods: result } = filterInstalled(mods, folders, 'e')
        expect(result.map((m) => m.uid)).toEqual(expect.arrayContaining(['a', 'b']))
        expect(result).toHaveLength(2)
    })

    it('returns all mods when query is empty', () => {
        const { mods: result } = filterInstalled(mods, folders, '')
        expect(result).toHaveLength(3)
    })

    it('returns empty array when no mods match', () => {
        const { mods: result } = filterInstalled(mods, folders, 'zzzzz')
        expect(result).toHaveLength(0)
    })

    it('includes all ancestor folder IDs of matching mods', () => {
        const { visibleFolderIds } = filterInstalled(mods, folders, 'crimson')
        expect(visibleFolderIds.has('child')).toBe(true)
        expect(visibleFolderIds.has('parent')).toBe(true)
    })

    it('root-level mods add no folder IDs to visibleFolderIds', () => {
        const { visibleFolderIds } = filterInstalled(mods, folders, 'Blue Storm')
        expect(visibleFolderIds.size).toBe(0)
    })

    it('returns an empty visibleFolderIds when no mods match', () => {
        const { visibleFolderIds } = filterInstalled(mods, folders, 'zzzzz')
        expect(visibleFolderIds.size).toBe(0)
    })
})

describe('normalizeModScopes', () => {
    it('returns the same array reference when all mods have unique IDs', () => {
        const mods = [makeMod('a', 1, 'A'), makeMod('b', 2, 'B')]
        expect(normalizeModScopes(mods)).toBe(mods)
    })

    it('returns the same array reference when all copies of an ID share the same scope', () => {
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 1, 'B', { folderId: 'f1' }),
        ]
        expect(normalizeModScopes(mods)).toBe(mods)
    })

    it('root (null) scope wins over any folder scope', () => {
        const mods = [
            makeMod('a', 1, 'A', { folderId: null }),
            makeMod('b', 1, 'B', { folderId: 'f1' }),
        ]
        const result = normalizeModScopes(mods)
        expect(result.find((m) => m.uid === 'a')!.folderId ?? null).toBeNull()
        expect(result.find((m) => m.uid === 'b')!.folderId ?? null).toBeNull()
    })

    it('majority folder scope wins when no copies are at root', () => {
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 1, 'B', { folderId: 'f1' }),
            makeMod('c', 1, 'C', { folderId: 'f2' }),
        ]
        const result = normalizeModScopes(mods)
        expect(result.every((m) => (m.folderId ?? null) === 'f1')).toBe(true)
    })

    it('does not affect mods with negative IDs', () => {
        const mods = [
            makeMod('a', -1, 'A', { folderId: 'f1' }),
            makeMod('b', -1, 'B', { folderId: 'f2' }),
        ]
        expect(normalizeModScopes(mods)).toBe(mods)
    })

    it('does not alter mods whose IDs are not in conflict', () => {
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 2, 'B', { folderId: 'f2' }),
            makeMod('c', 1, 'C', { folderId: 'f2' }),
        ]
        const result = normalizeModScopes(mods)
        expect(result.find((m) => m.uid === 'b')!.folderId).toBe('f2')
    })
})

describe('computeChildren', () => {
    type ModEntry = Extract<ChildEntry, { type: 'mod' }>

    it('places all mod groups before all folders', () => {
        const folders = [makeFolder('f1', { priority: 100 })]
        const mods = [
            makeMod('a', 1, 'A', { priority: 10 }),
            makeMod('b', 2, 'B', { folderId: 'f1' }),
        ]
        const result = computeChildren(mods, folders, null)
        const types = result.map((e) => e.type)
        const lastModIdx = types.lastIndexOf('mod')
        const firstFolderIdx = types.indexOf('folder')
        expect(lastModIdx).toBeLessThan(firstFolderIdx)
    })

    it('groups mods with the same id into a single entry', () => {
        const mods = [
            makeMod('a', 5, 'Mod', { priority: 10 }),
            makeMod('b', 5, 'Mod', { priority: 20 }),
            makeMod('c', 5, 'Mod', { priority: 30 }),
        ]
        const result = computeChildren(mods, [], null)
        expect(result).toHaveLength(1)
        expect(result[0].type).toBe('mod')
        expect((result[0] as ModEntry).mods).toHaveLength(3)
    })

    it('sorts mods within a group by priority descending', () => {
        const mods = [
            makeMod('a', 5, 'Mod', { priority: 10 }),
            makeMod('b', 5, 'Mod', { priority: 30 }),
            makeMod('c', 5, 'Mod', { priority: 20 }),
        ]
        const result = computeChildren(mods, [], null)
        expect(result[0].type).toBe('mod')
        expect((result[0] as ModEntry).mods.map((m) => m.priority)).toEqual([30, 20, 10])
    })

    it('sorts independent mod groups by priority descending', () => {
        const mods = [
            makeMod('a', 1, 'A', { priority: 10 }),
            makeMod('b', 2, 'B', { priority: 30 }),
        ]
        const result = computeChildren(mods, [], null)
        expect(result[0].type).toBe('mod')
        expect(result[1].type).toBe('mod')
        expect((result[0] as ModEntry).mods[0].uid).toBe('b')
        expect((result[1] as ModEntry).mods[0].uid).toBe('a')
    })

    it('sorts folders by priority descending', () => {
        const folders = [makeFolder('f1', { priority: 10 }), makeFolder('f2', { priority: 30 })]
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 2, 'B', { folderId: 'f2' }),
        ]
        const result = computeChildren(mods, folders, null)
        const folderEntries = result.filter(
            (e): e is { type: 'folder'; folder: ModFolder } => e.type === 'folder'
        )
        expect(folderEntries[0].folder.id).toBe('f2')
        expect(folderEntries[1].folder.id).toBe('f1')
    })

    it('includes folders that have no mods', () => {
        const folders = [makeFolder('empty')]
        const result = computeChildren([], folders, null)
        expect(result).toHaveLength(1)
        expect(result[0].type).toBe('folder')
    })

    it('only includes mods whose folderId matches parentId', () => {
        const mods = [
            makeMod('a', 1, 'A', { folderId: null }),
            makeMod('b', 2, 'B', { folderId: 'f1' }),
        ]
        const result = computeChildren(mods, [], null)
        expect(result).toHaveLength(1)
        expect(result[0].type).toBe('mod')
        expect((result[0] as ModEntry).mods[0].uid).toBe('a')
    })

    it('filters folders by visibleFolderIds when provided', () => {
        const folders = [makeFolder('f1'), makeFolder('f2')]
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 2, 'B', { folderId: 'f2' }),
        ]
        const result = computeChildren(mods, folders, null, new Set(['f1']))
        const folderIds = result
            .filter((e): e is { type: 'folder'; folder: ModFolder } => e.type === 'folder')
            .map((e) => e.folder.id)
        expect(folderIds).toEqual(['f1'])
    })

    it('shows all folders when visibleFolderIds is undefined', () => {
        const folders = [makeFolder('f1'), makeFolder('f2')]
        const mods = [
            makeMod('a', 1, 'A', { folderId: 'f1' }),
            makeMod('b', 2, 'B', { folderId: 'f2' }),
        ]
        const result = computeChildren(mods, folders, null, undefined)
        expect(result.filter((e) => e.type === 'folder')).toHaveLength(2)
    })
})

describe('groupChildren', () => {
    type RootGroup = Extract<ChildGroup, { type: 'root-group' }>

    it('returns empty array for empty input', () => {
        expect(groupChildren([])).toEqual([])
    })

    it('groups consecutive mods into a single root-group', () => {
        const entries: ChildEntry[] = [
            { type: 'mod', mods: [makeMod('a', 1, 'A')] },
            { type: 'mod', mods: [makeMod('b', 2, 'B')] },
        ]
        const result = groupChildren(entries)
        expect(result).toHaveLength(1)
        expect(result[0].type).toBe('root-group')
        expect((result[0] as RootGroup).groups).toHaveLength(2)
    })

    it('splits mod runs into separate root-groups when a folder appears between them', () => {
        const entries: ChildEntry[] = [
            { type: 'mod', mods: [makeMod('a', 1, 'A')] },
            { type: 'folder', folder: makeFolder('f1') },
            { type: 'mod', mods: [makeMod('b', 2, 'B')] },
        ]
        const result = groupChildren(entries)
        expect(result).toHaveLength(3)
        expect(result[0].type).toBe('root-group')
        expect(result[1].type).toBe('folder')
        expect(result[2].type).toBe('root-group')
    })

    it('emits individual folder entries for a pure folder list', () => {
        const entries: ChildEntry[] = [
            { type: 'folder', folder: makeFolder('f1') },
            { type: 'folder', folder: makeFolder('f2') },
        ]
        const result = groupChildren(entries)
        expect(result).toHaveLength(2)
        expect(result.every((g) => g.type === 'folder')).toBe(true)
    })

    it('collects trailing mods after the last folder into their own root-group', () => {
        const entries: ChildEntry[] = [
            { type: 'folder', folder: makeFolder('f1') },
            { type: 'mod', mods: [makeMod('a', 1, 'A')] },
            { type: 'mod', mods: [makeMod('b', 2, 'B')] },
        ]
        const result = groupChildren(entries)
        expect(result).toHaveLength(2)
        expect(result[0].type).toBe('folder')
        expect(result[1].type).toBe('root-group')
        expect((result[1] as RootGroup).groups).toHaveLength(2)
    })

    it('handles alternating folders and single mods correctly', () => {
        const entries: ChildEntry[] = [
            { type: 'mod', mods: [makeMod('a', 1, 'A')] },
            { type: 'folder', folder: makeFolder('f1') },
            { type: 'folder', folder: makeFolder('f2') },
            { type: 'mod', mods: [makeMod('b', 2, 'B')] },
        ]
        const result = groupChildren(entries)
        expect(result.map((g) => g.type)).toEqual(['root-group', 'folder', 'folder', 'root-group'])
    })
})
