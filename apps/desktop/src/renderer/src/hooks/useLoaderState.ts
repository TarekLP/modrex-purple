import { useCallback, useState } from 'react'
import type { GameId } from '../../../shared/types'
import { api } from '../api'
import { buildLoaderModIds, loaderForModId, type LoaderState } from '../loaders'

/**
 * Per-loader presence state plus the install dispatch, shared by BrowsePage and
 * ModDetailPage. Both need the same three things and had near-identical copies:
 * a keyed state map, a re-check after installing, and the registry-driven choice
 * between a direct loader install and the normal mod flow.
 *
 * The presence-check effects stay in the components: BrowsePage checks every loader
 * with a mod page when browse becomes active, while ModDetailPage checks only the
 * loaders the open mod actually depends on.
 */
export function useLoaderState(activeGame: GameId, gamePath: string | null) {
    const [loaderState, setLoaderState] = useState<LoaderState>({})

    const setLoaderFlag = useCallback(
        (id: string, value: boolean | null) => setLoaderState((prev) => ({ ...prev, [id]: value })),
        []
    )

    /**
     * Re-reads presence rather than assuming an install succeeded: a loader can be on
     * disk and still unusable (SuperBLT on PD2's Diesel 3.0 branch), and an optimistic
     * true made the UI claim Installed while the install flow reported it missing.
     */
    const refreshLoader = useCallback(
        async (id: string): Promise<boolean | null> => {
            if (!gamePath) return null
            const ok = await api.checkLoader(id, activeGame, gamePath)
            setLoaderFlag(id, ok)
            return ok
        },
        [activeGame, gamePath, setLoaderFlag]
    )

    /**
     * Installs the loader behind a dependency and returns its presence afterwards.
     * loaderModId is the dependency's modworkshop id, or null for an offsite BLT dep
     * (SuperBLT has no mod page). A viaModFlow loader has no canonical download host and
     * is routed server-side via the UE4SS_LOADER sentinel, so it rides the normal mod
     * install instead.
     */
    const installLoader = useCallback(
        async (loaderModId: number | null): Promise<boolean | null> => {
            if (!gamePath) return null
            const loader =
                loaderModId === null ? undefined : loaderForModId(activeGame, loaderModId)
            if (loader?.viaModFlow) {
                await api.installMod(loaderModId!, gamePath, activeGame)
                return refreshLoader(loader.id)
            }
            const id = loader?.id ?? 'superblt'
            await api.installLoader(id, gamePath)
            return refreshLoader(id)
        },
        [activeGame, gamePath, refreshLoader]
    )

    return {
        loaderState,
        setLoaderState,
        setLoaderFlag,
        refreshLoader,
        installLoader,
        loaderModIds: buildLoaderModIds(activeGame, loaderState),
    }
}
