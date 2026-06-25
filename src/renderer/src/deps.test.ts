import { describe, it, expect } from 'vitest'
import {
    collectDeps,
    isOffsiteDep,
    isLoaderDep,
    isUe4ssLoaderId,
    isPdthLoaderId,
    missingRequiredDeps,
    offsiteDepHost,
    ue4ssLoaderIdsFor,
    loaderIdsForGame,
    buildLoaderModIds,
    PDTH_OVERRIDES_ID,
    DAHM_ID,
    PDTH_LOADER_IDS,
} from './deps'
import type { Mod, ModDependency, InstalledMod } from '../../shared/types'

function dep(overrides: Partial<ModDependency>): ModDependency {
    return { id: 1, mod_id: null, optional: false, mod: null, ...overrides }
}

function hostedMod(id: number): Mod {
    return { id, name: `mod-${id}` } as Mod
}

const superbltDep = dep({
    id: 10,
    name: 'SuperBLT',
    url: 'https://superblt.znix.xyz/',
})

const installedFive = [{ id: 5 } as InstalledMod]

describe('collectDeps', () => {
    it('merges direct and template deps', () => {
        const mod = {
            dependencies: [dep({ id: 1, mod: hostedMod(5) })],
            instructs_template: { dependencies: [superbltDep] },
        } as unknown as Mod
        expect(collectDeps(mod).map((d) => d.id)).toEqual([1, 10])
    })

    it('drops deleted-mod deps (no mod, no url)', () => {
        const mod = {
            dependencies: [dep({ id: 1 })],
        } as unknown as Mod
        expect(collectDeps(mod)).toEqual([])
    })

    it('returns empty for null mod', () => {
        expect(collectDeps(null)).toEqual([])
    })
})

describe('isOffsiteDep / isLoaderDep', () => {
    it('detects offsite deps by url with null mod', () => {
        expect(isOffsiteDep(superbltDep)).toBe(true)
        expect(isOffsiteDep(dep({ mod: hostedMod(5) }))).toBe(false)
        expect(isOffsiteDep(dep({}))).toBe(false)
    })

    it('detects loader deps by blt in name or url', () => {
        expect(isLoaderDep(superbltDep)).toBe(true)
        expect(isLoaderDep(dep({ name: 'PDTH BLT', url: 'https://example.com/' }))).toBe(true)
        expect(isLoaderDep(dep({ name: 'Some Tool', url: 'https://example.com/' }))).toBe(false)
    })

    it('does not treat a hosted mod named blt as a loader dep', () => {
        expect(isLoaderDep(dep({ name: 'SuperBLT', mod: hostedMod(5) }))).toBe(false)
    })
})

describe('isUe4ssLoaderId / ue4ssLoaderIdsFor', () => {
    it('recognizes both PD3 mod pages that distribute UE4SS', () => {
        expect(isUe4ssLoaderId('pd3', 47771)).toBe(true)
        expect(isUe4ssLoaderId('pd3', 44048)).toBe(true)
        expect(isUe4ssLoaderId('pd3', 12345)).toBe(false)
    })

    it('recognizes the single Crime Boss UE4SS mod page', () => {
        expect(isUe4ssLoaderId('cb', 47749)).toBe(true)
        expect(isUe4ssLoaderId('cb', 47771)).toBe(false)
    })

    it('returns false for games without a UE4SS mod page, or an undefined game', () => {
        expect(isUe4ssLoaderId('pdth', 47749)).toBe(false)
        expect(isUe4ssLoaderId(undefined, 47749)).toBe(false)
    })

    it('lists every known id for a game', () => {
        expect(ue4ssLoaderIdsFor('pd3')).toEqual([47771, 44048])
        expect(ue4ssLoaderIdsFor('cb')).toEqual([47749])
        expect(ue4ssLoaderIdsFor('pdth')).toEqual([])
        expect(ue4ssLoaderIdsFor(undefined)).toEqual([])
    })
})

describe('isPdthLoaderId / PDTH_LOADER_IDS', () => {
    it('recognizes PDTHModOverrides and DAHM only for pdth', () => {
        expect(isPdthLoaderId('pdth', PDTH_OVERRIDES_ID)).toBe(true)
        expect(isPdthLoaderId('pdth', DAHM_ID)).toBe(true)
        expect(isPdthLoaderId('pdth', 12345)).toBe(false)
    })

    it('returns false for non-pdth games and undefined', () => {
        expect(isPdthLoaderId('pd3', PDTH_OVERRIDES_ID)).toBe(false)
        expect(isPdthLoaderId('cb', DAHM_ID)).toBe(false)
        expect(isPdthLoaderId(undefined, PDTH_OVERRIDES_ID)).toBe(false)
    })

    it('lists both loader ids', () => {
        expect(PDTH_LOADER_IDS).toEqual([53474, 14267])
    })
})

describe('loaderIdsForGame', () => {
    it('returns PDTH loaders for pdth, UE4SS pages otherwise, [] for pd2/undefined', () => {
        expect(loaderIdsForGame('pdth')).toEqual([53474, 14267])
        expect(loaderIdsForGame('pd3')).toEqual([47771, 44048])
        expect(loaderIdsForGame('cb')).toEqual([47749])
        expect(loaderIdsForGame('pd2')).toEqual([])
        expect(loaderIdsForGame(undefined)).toEqual([])
    })
})

describe('buildLoaderModIds', () => {
    const flags = (
        o: Partial<
            Record<'pdthOverridesInstalled' | 'dahmInstalled' | 'ue4ssInstalled', boolean | null>
        > = {}
    ) => ({
        pdthOverridesInstalled: null,
        dahmInstalled: null,
        ue4ssInstalled: null,
        ...o,
    })

    it('maps PDTH to its two loaders using their flags', () => {
        expect(
            buildLoaderModIds('pdth', flags({ pdthOverridesInstalled: true, dahmInstalled: false }))
        ).toEqual({ 53474: true, 14267: false })
    })

    it('maps PD3/CB UE4SS pages to the shared ue4ss flag', () => {
        expect(buildLoaderModIds('pd3', flags({ ue4ssInstalled: true }))).toEqual({
            47771: true,
            44048: true,
        })
        expect(buildLoaderModIds('cb', flags({ ue4ssInstalled: false }))).toEqual({ 47749: false })
    })

    it('returns empty for games without hosted loaders', () => {
        expect(buildLoaderModIds('pd2', flags())).toEqual({})
        expect(buildLoaderModIds(undefined, flags())).toEqual({})
    })
})

describe('missingRequiredDeps', () => {
    it('skips optional deps', () => {
        const deps = [
            dep({ optional: true, mod: hostedMod(5) }),
            { ...superbltDep, optional: true },
        ]
        expect(missingRequiredDeps(deps, [], false)).toEqual([])
    })

    it('reports hosted deps missing from the installed list', () => {
        const deps = [dep({ id: 1, mod: hostedMod(5) }), dep({ id: 2, mod: hostedMod(6) })]
        expect(missingRequiredDeps(deps, installedFive, null).map((d) => d.id)).toEqual([2])
    })

    it('reports loader deps missing only on a definitive negative', () => {
        expect(missingRequiredDeps([superbltDep], [], false)).toEqual([superbltDep])
        expect(missingRequiredDeps([superbltDep], [], true)).toEqual([])
        expect(missingRequiredDeps([superbltDep], [], null)).toEqual([])
    })

    it('always surfaces unverifiable offsite deps', () => {
        const tool = dep({ id: 3, name: 'Some Tool', url: 'https://example.com/' })
        expect(missingRequiredDeps([tool], [], true)).toEqual([tool])
    })

    it('ignores deleted-mod deps', () => {
        expect(missingRequiredDeps([dep({})], [], false)).toEqual([])
    })

    it('treats a hosted dep matching a loaderModIds entry like a loader dep', () => {
        const overridesDep = dep({ id: 99, mod: hostedMod(53474) })
        expect(missingRequiredDeps([overridesDep], [], false, { 53474: false })).toEqual([
            overridesDep,
        ])
        expect(missingRequiredDeps([overridesDep], [], true, { 53474: true })).toEqual([])
        expect(missingRequiredDeps([overridesDep], [], null, { 53474: null })).toEqual([])
        expect(missingRequiredDeps([overridesDep], [], true)).toEqual([overridesDep])
    })
})

describe('offsiteDepHost', () => {
    it('extracts the hostname', () => {
        expect(offsiteDepHost('https://superblt.znix.xyz/')).toBe('superblt.znix.xyz')
    })

    it('falls back to the raw string for invalid urls', () => {
        expect(offsiteDepHost('not a url')).toBe('not a url')
    })
})
