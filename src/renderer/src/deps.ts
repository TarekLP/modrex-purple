import type { Mod, ModDependency, InstalledMod } from '../../shared/types'

/**
 * Combines a mod's direct and instructs-template dependencies, keeping
 * modworkshop-hosted deps (`mod` set) and offsite deps (`url` set, e.g.
 * SuperBLT). Deps whose mod was deleted (neither set) are dropped.
 */
export function collectDeps(mod: Mod | null | undefined): ModDependency[] {
    return [...(mod?.dependencies ?? []), ...(mod?.instructs_template?.dependencies ?? [])].filter(
        (d) => d.mod !== null || !!d.url
    )
}

export function isOffsiteDep(d: ModDependency): boolean {
    return d.mod === null && !!d.url
}

/**
 * BLT-family mod loaders (SuperBLT, PDTH BLT) are declared on modworkshop as
 * offsite dependencies. They live in the game root as a loader DLL, so their
 * install state comes from `api.checkSuperblt`, not the installed-mods list.
 */
export function isLoaderDep(d: ModDependency): boolean {
    return isOffsiteDep(d) && `${d.name ?? ''} ${d.url ?? ''}`.toLowerCase().includes('blt')
}

/**
 * Required deps the user doesn't have. `loaderInstalled` is the result of
 * `api.checkSuperblt` (null = unknown) — loader deps are only reported missing
 * on a definitive negative, so detection gaps never nag users who already have
 * the loader. Non-loader offsite deps can't be verified and are always surfaced;
 * the per-mod dismissal handles false positives there. Pass `loaderModIds` for
 * loaders hosted on modworkshop but installed as game-root DLLs (e.g.
 * PDTHModOverrides 53474, DAHM 14267) — those deps are checked against their
 * per-id installed state rather than the installed-mods list.
 */
export function missingRequiredDeps(
    allDeps: ModDependency[],
    installed: InstalledMod[],
    loaderInstalled: boolean | null,
    loaderModIds: Record<number, boolean | null> = {}
): ModDependency[] {
    return allDeps.filter((d) => {
        if (d.optional) return false
        if (d.mod !== null) {
            const id = d.mod.id
            if (id in loaderModIds) return loaderModIds[id] === false
            return !installed.some((m) => m.id === id)
        }
        if (!d.url) return false
        if (isLoaderDep(d)) return loaderInstalled === false
        return true
    })
}

export function offsiteDepHost(url: string): string {
    try {
        return new URL(url).hostname
    } catch {
        return url
    }
}
