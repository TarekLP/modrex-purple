import { api, type LoaderInfo } from './api'

// Mirrors the Rust loader registry (src-tauri/src/commands/loaders.rs), which owns which
// loaders exist, the modworkshop ids they are published under, and the games they serve.
// Loaded once at startup so the lookups below can stay synchronous: they run inside
// render paths (ModDetailPage computes its dep warning while rendering).
let registry: LoaderInfo[] = []

export async function loadLoaderRegistry(): Promise<void> {
    registry = await api.listLoaders()
}

export function loadersForGame(gameId: string): LoaderInfo[] {
    return registry.filter((l) => l.games.includes(gameId))
}

/** The loader a modworkshop dependency id refers to, if any. */
export function loaderForModId(gameId: string, modId: number): LoaderInfo | undefined {
    return loadersForGame(gameId).find((l) => l.modworkshopIds.includes(modId))
}

/**
 * Per-loader install state, keyed by loader id. null = not checked yet; loader deps are
 * only reported missing on a definitive false, so an unchecked loader never nags.
 */
export type LoaderState = Record<string, boolean | null>

/**
 * Per-modworkshop-id install state in the shape missingRequiredDeps expects, expanding
 * each loader's state across every id it is published under (UE4SS has three).
 */
export function buildLoaderModIds(
    gameId: string,
    state: LoaderState
): Record<number, boolean | null> {
    const byId: Record<number, boolean | null> = {}
    for (const loader of loadersForGame(gameId)) {
        for (const modId of loader.modworkshopIds) {
            byId[modId] = state[loader.id] ?? null
        }
    }
    return byId
}

/**
 * Checks every loader for a game whose state is still unknown and that the mod actually
 * depends on, so a dep warning is decided from definitive values. neededIds are the
 * dependency mod ids in play; a loader is only probed when one of its ids appears there.
 */
export async function resolveLoaderState(
    gameId: string,
    gamePath: string,
    neededIds: number[],
    known: LoaderState
): Promise<LoaderState> {
    const resolved: LoaderState = { ...known }
    await Promise.all(
        loadersForGame(gameId).map(async (loader) => {
            if (resolved[loader.id] != null) return
            if (!loader.modworkshopIds.some((id) => neededIds.includes(id))) return
            resolved[loader.id] = await api.checkLoader(loader.id, gameId, gamePath)
        })
    )
    return resolved
}
