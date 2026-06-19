import type { Mod, InstalledMod, ModFolder } from '../../../shared/types'

export type ChildEntry =
    | { type: 'folder'; folder: ModFolder }
    | { type: 'mod'; mods: InstalledMod[] }

export type ChildGroup =
    | { type: 'folder'; folder: ModFolder }
    | { type: 'root-group'; groups: InstalledMod[][] }

// Filenames on disk carry a NNN_ priority prefix; archive entry names don't.
// Strip it when comparing the two.
export function stripPriorityPrefix(filename: string): string {
    return filename.replace(/^\d+_/, '')
}

// Last path component of an archive entry path.
export function entryFilename(entry: string): string {
    return entry.split('/').pop() ?? entry
}

// Filenames on disk carry a NNN_ priority prefix and .pak extension — disk-level
// noise for display purposes. Falls back to the raw name if stripping empties it.
export function displayFilename(filename: string): string {
    const stripped = stripPriorityPrefix(filename).replace(/\.pak$/i, '')
    return stripped || filename
}

export function syntheticMod(ins: InstalledMod): Mod {
    return {
        id: ins.id,
        name: ins.name,
        desc: '',
        short_desc: 'Manually installed — not on modworkshop',
        version: ins.version,
        downloads: 0,
        likes: 0,
        views: 0,
        published_at: ins.installedAt,
        bumped_at: ins.installedAt,
        category_id: 0,
        has_download: false,
        thumbnail: null,
        download: null,
        user: { name: 'Unknown' },
    }
}

export function getAllModsInFolder(
    mods: InstalledMod[],
    folders: ModFolder[],
    folderId: string
): InstalledMod[] {
    const direct = mods.filter((m) => (m.folderId ?? null) === folderId)
    const childFolders = folders.filter((f) => f.parentId === folderId)
    return [...direct, ...childFolders.flatMap((f) => getAllModsInFolder(mods, folders, f.id))]
}

export function filterInstalled(
    mods: InstalledMod[],
    folders: ModFolder[],
    query: string
): { mods: InstalledMod[]; visibleFolderIds: Set<string> } {
    const lower = query.toLowerCase()
    const matching = mods.filter((m) => m.name.toLowerCase().includes(lower))
    const visibleFolderIds = new Set<string>()
    for (const m of matching) {
        let id = m.folderId ?? null
        while (id) {
            if (visibleFolderIds.has(id)) break
            visibleFolderIds.add(id)
            id = folders.find((f) => f.id === id)?.parentId ?? null
        }
    }
    return { mods: matching, visibleFolderIds }
}

export function normalizeModScopes(mods: InstalledMod[]): InstalledMod[] {
    const groups = new Map<number, InstalledMod[]>()
    for (const m of mods) {
        if (m.id < 0) continue
        const g = groups.get(m.id)
        if (g) g.push(m)
        else groups.set(m.id, [m])
    }

    const overrides = new Map<string, string | null>()
    for (const [, group] of groups) {
        const scopes = group.map((m) => m.folderId ?? null)
        const distinct = new Set(scopes.map(String))
        if (distinct.size <= 1) continue
        // Only collapse when some files ended up at root — handles the split-install artifact
        // where reinstalling puts some paks at root. Leave intentional multi-folder layouts alone.
        if (!scopes.some((s) => s === null)) continue
        for (const m of group) {
            if ((m.folderId ?? null) !== null) overrides.set(m.uid, null)
        }
    }

    if (overrides.size === 0) return mods
    return mods.map((m) => (overrides.has(m.uid) ? { ...m, folderId: overrides.get(m.uid) } : m))
}

export function computeChildren(
    mods: InstalledMod[],
    folders: ModFolder[],
    parentId: string | null,
    visibleFolderIds?: Set<string>
): ChildEntry[] {
    const scopedMods = mods.filter((m) => (m.folderId ?? null) === parentId)
    const groupMap = new Map<number, InstalledMod[]>()
    for (const m of scopedMods) {
        if (!groupMap.has(m.id)) groupMap.set(m.id, [])
        groupMap.get(m.id)!.push(m)
    }
    const items: ChildEntry[] = []
    for (const groupMods of groupMap.values()) {
        groupMods.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        items.push({ type: 'mod', mods: groupMods })
    }
    for (const folder of folders.filter(
        (f) => f.parentId === parentId && (!visibleFolderIds || visibleFolderIds.has(f.id))
    )) {
        items.push({ type: 'folder', folder })
    }
    items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'mod' ? -1 : 1
        const pa = a.type === 'folder' ? a.folder.priority : (a.mods[0].priority ?? 0)
        const pb = b.type === 'folder' ? b.folder.priority : (b.mods[0].priority ?? 0)
        return pb - pa
    })
    return items
}

export function groupChildren(entries: ChildEntry[]): ChildGroup[] {
    const groups: ChildGroup[] = []
    let run: InstalledMod[][] = []
    for (const entry of entries) {
        if (entry.type === 'folder') {
            if (run.length > 0) {
                groups.push({ type: 'root-group', groups: run })
                run = []
            }
            groups.push({ type: 'folder', folder: entry.folder })
        } else {
            run.push(entry.mods)
        }
    }
    if (run.length > 0) groups.push({ type: 'root-group', groups: run })
    return groups
}
