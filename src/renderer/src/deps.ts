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
 * UE4SS loader mod ids, hosted on modworkshop (unlike SuperBLT, so they're checked via
 * `loaderModIds` rather than `isLoaderDep`'s offsite heuristic). Crime Boss has a single
 * maintained release; PAYDAY 3 has two independently-maintained mod pages distributing
 * UE4SS over time (different proxy DLLs, same loader) — both ids must be recognized so a
 * dependency on either shows "install the loader" instead of "missing mod".
 */
const UE4SS_LOADER_IDS: Record<string, number[]> = { cb: [47749], pd3: [47771, 44048] }

export function isUe4ssLoaderId(gameId: string | undefined, id: number): boolean {
    return !!gameId && (UE4SS_LOADER_IDS[gameId] ?? []).includes(id)
}

export function ue4ssLoaderIdsFor(gameId: string | undefined): number[] {
    return (gameId && UE4SS_LOADER_IDS[gameId]) || []
}

/**
 * PDTH mod loaders hosted on modworkshop (real mod pages) but installed as game-root
 * DLLs rather than tracked mods — PDTHModOverrides and DAHM. Like the UE4SS ids, a
 * dependency on one of these is checked via `loaderModIds` (per-id install state) instead
 * of the installed-mods list, and install dispatches to a dedicated command. Centralized
 * here so call sites reference one source — add a new PDTH loader id here, not inline.
 */
export const PDTH_OVERRIDES_ID = 53474
export const DAHM_ID = 14267
export const PDTH_LOADER_IDS: number[] = [PDTH_OVERRIDES_ID, DAHM_ID]

export function isPdthLoaderId(gameId: string | undefined, id: number): boolean {
    return gameId === 'pdth' && PDTH_LOADER_IDS.includes(id)
}

/**
 * RAID's mod loader, hosted on modworkshop (mod page 49744) but installed as a
 * game-root package (loader DLL plus the mods/base Lua basemod) via a dedicated
 * command — the same hosted-loader shape as PDTH's. RAID mods declare it as an
 * instructs-template dependency.
 */
export const RAID_SUPERBLT_ID = 49744

export function isRaidLoaderId(gameId: string | undefined, id: number): boolean {
    return gameId === 'raid' && id === RAID_SUPERBLT_ID
}

/**
 * The loader mod ids the dep-warning UI can offer to install for `gameId`: PDTH's two
 * hosted loaders, RAID's SuperBLT page, or the UE4SS page(s) for PD3/Crime Boss
 * (empty for PD2).
 */
export function loaderIdsForGame(gameId: string | undefined): number[] {
    if (gameId === 'pdth') return PDTH_LOADER_IDS
    if (gameId === 'raid') return [RAID_SUPERBLT_ID]
    return ue4ssLoaderIdsFor(gameId)
}

/**
 * Per-id install state for `gameId`'s hosted loaders, in the `Record<id, installed?>` shape
 * `missingRequiredDeps` expects. The flags are the caller's own presence-check results
 * (`null` = not yet checked): PDTH maps to PDTHModOverrides + DAHM; RAID maps its SuperBLT
 * page to `raidSuperbltInstalled`; PD3/Crime Boss map their UE4SS page(s) to the single
 * `ue4ssInstalled` flag; other games map to `{}`.
 */
export function buildLoaderModIds(
    gameId: string | undefined,
    flags: {
        pdthOverridesInstalled: boolean | null
        dahmInstalled: boolean | null
        ue4ssInstalled: boolean | null
        raidSuperbltInstalled: boolean | null
    }
): Record<number, boolean | null> {
    if (gameId === 'pdth') {
        return { [PDTH_OVERRIDES_ID]: flags.pdthOverridesInstalled, [DAHM_ID]: flags.dahmInstalled }
    }
    if (gameId === 'raid') {
        return { [RAID_SUPERBLT_ID]: flags.raidSuperbltInstalled }
    }
    return Object.fromEntries(
        ue4ssLoaderIdsFor(gameId).map((id): [number, boolean | null] => [id, flags.ue4ssInstalled])
    )
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
