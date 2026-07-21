import type { Mod, ModDependency, InstalledMod } from '../../shared/types'
import { collectDeps, missingRequiredDeps, isLoaderDep } from './deps'
import { buildLoaderModIds, resolveLoaderState, type LoaderState } from './loaders'
import { api } from './api'

export type { LoaderState } from './loaders'

export type DepCheckResult = {
    allDeps: ModDependency[]
    bltLoaderInstalled: boolean | null
    loaderState: LoaderState
}

/**
 * Checks whether a mod install should be blocked by a deps warning.
 *
 * Returns non-null when the warning should be shown (missing required deps,
 * not yet dismissed). Returns null when the install can proceed (no missing
 * deps, or already session/permanently dismissed). Also performs inline
 * presence checks for any loader whose state is still unknown (null), so
 * missingRequiredDeps always gets a definitive value.
 */
export async function resolveDepCheck(
    modId: number,
    fullMod: Mod,
    gamePath: string,
    activeGame: string,
    installed: InstalledMod[],
    loaderState: LoaderState
): Promise<DepCheckResult | null> {
    if (sessionStorage.getItem(`depsWarningDismissed-${modId}`)) return null

    const allDeps = collectDeps(fullMod)

    // SuperBLT has no modworkshop page, so it is matched by the offsite name heuristic
    // rather than a dependency id, and only for the game that actually uses it (PD2;
    // see isLoaderDep). check_loader already reports it unusable on Diesel 3.0.
    let bltOk = loaderState.superblt ?? null
    if (activeGame === 'pd2' && allDeps.some(isLoaderDep)) {
        bltOk = await api.checkLoader('superblt', activeGame, gamePath)
    }

    const depIds = allDeps.flatMap((d) => (d.mod ? [d.mod.id] : []))
    const resolved = await resolveLoaderState(activeGame, gamePath, depIds, {
        ...loaderState,
        superblt: bltOk,
    })

    const loaderModIds = buildLoaderModIds(activeGame, resolved)
    const missingRequired = missingRequiredDeps(allDeps, installed, bltOk, loaderModIds)
    if (missingRequired.length === 0) return null

    const s = await api.getSettings()
    if (s.dismissedDepsWarnings?.includes(modId)) return null

    return { allDeps, bltLoaderInstalled: bltOk, loaderState: resolved }
}
