import type { Mod, ModDependency, InstalledMod } from '../../shared/types'
import {
    collectDeps,
    buildLoaderModIds,
    missingRequiredDeps,
    isLoaderDep,
    isUe4ssLoaderId,
    PDTH_OVERRIDES_ID,
    DAHM_ID,
    RAID_SUPERBLT_ID,
} from './deps'
import { api } from './api'

export type LoaderState = {
    loaderInstalled: boolean | null
    ue4ssInstalled: boolean | null
    pdthOverridesInstalled: boolean | null
    dahmInstalled: boolean | null
    raidSuperbltInstalled: boolean | null
}

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
 * `missingRequiredDeps` always gets a definitive value.
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

    let bltOk = loaderState.loaderInstalled
    if (activeGame !== 'pdth' && allDeps.some(isLoaderDep)) {
        bltOk = await api.checkSuperblt(gamePath)
        if (bltOk && activeGame === 'pd2' && (await api.isPd2Diesel3(gamePath))) bltOk = false
    }

    let pdthOverridesOk = loaderState.pdthOverridesInstalled
    if (
        activeGame === 'pdth' &&
        pdthOverridesOk === null &&
        allDeps.some((d) => d.mod?.id === PDTH_OVERRIDES_ID)
    ) {
        pdthOverridesOk = await api.checkPdthOverrides(gamePath)
    }

    let dahmOk = loaderState.dahmInstalled
    if (activeGame === 'pdth' && dahmOk === null && allDeps.some((d) => d.mod?.id === DAHM_ID)) {
        dahmOk = await api.checkDahm(gamePath)
    }

    let ue4ssOk = loaderState.ue4ssInstalled
    if (
        ue4ssOk === null &&
        allDeps.some((d) => d.mod !== null && isUe4ssLoaderId(activeGame, d.mod.id))
    ) {
        ue4ssOk = await api.checkUe4ss(gamePath, activeGame)
    }

    let raidSbltOk = loaderState.raidSuperbltInstalled
    if (
        activeGame === 'raid' &&
        raidSbltOk === null &&
        allDeps.some((d) => d.mod?.id === RAID_SUPERBLT_ID)
    ) {
        raidSbltOk = await api.checkRaidSuperblt(gamePath)
    }

    const loaderModIds = buildLoaderModIds(activeGame, {
        pdthOverridesInstalled: pdthOverridesOk,
        dahmInstalled: dahmOk,
        ue4ssInstalled: ue4ssOk,
        raidSuperbltInstalled: raidSbltOk,
    })

    const missingRequired = missingRequiredDeps(allDeps, installed, bltOk, loaderModIds)
    if (missingRequired.length === 0) return null

    const s = await api.getSettings()
    if (s.dismissedDepsWarnings?.includes(modId)) return null

    return {
        allDeps,
        bltLoaderInstalled: bltOk,
        loaderState: {
            loaderInstalled: bltOk,
            ue4ssInstalled: ue4ssOk,
            pdthOverridesInstalled: pdthOverridesOk,
            dahmInstalled: dahmOk,
            raidSuperbltInstalled: raidSbltOk,
        },
    }
}
