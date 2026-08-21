import { GAMES, type GameId, type GameSpec } from '@modrex/games'

// The index pipeline serves only games ModWorkshop hosts. itr2 (the first Nexus-only
// game) has no workshopId and stays out: bootstrap, listing sync, and catalog
// verification all assume exactly one ModWorkshop source per game. Games here are
// indexed by ModWorkshop id, so a missing workshopId would produce "undefined" rows.
// The set mirrors check-sources.mjs's registry and must be kept in sync with it.
type ModworkshopGameSpec = GameSpec & { workshopId: number }

export const MODWORKSHOP_GAMES = Object.fromEntries(
    (Object.entries(GAMES) as [GameId, GameSpec][]).filter(
        (entry): entry is [GameId, ModworkshopGameSpec] => entry[1].workshopId !== undefined
    )
) as Record<GameId, ModworkshopGameSpec>

export const MODWORKSHOP_GAME_IDS = Object.keys(MODWORKSHOP_GAMES) as GameId[]
