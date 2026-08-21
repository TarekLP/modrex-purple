import { MODWORKSHOP_GAME_IDS, MODWORKSHOP_GAMES } from '../modworkshop-games.js'
import type { NeonQueryFunction } from '@neondatabase/serverless'

const MODWORKSHOP_API_BASE = 'https://api.modworkshop.net'

export async function bootstrapCatalog(sql: NeonQueryFunction<false, false>): Promise<void> {
    for (const slug of MODWORKSHOP_GAME_IDS) {
        const game = MODWORKSHOP_GAMES[slug]
        const rows = (await sql`
            INSERT INTO games (name, slug)
            VALUES (${game.name}, ${slug})
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        `) as { id: string }[]
        const gameId = rows[0].id

        await sql`
            INSERT INTO sources (game_id, name, base_url, game_ref)
            VALUES (${gameId}, 'modworkshop', ${MODWORKSHOP_API_BASE}, ${String(game.workshopId)})
            ON CONFLICT (game_id, name) DO UPDATE SET
                base_url = EXCLUDED.base_url,
                game_ref = EXCLUDED.game_ref
        `
    }
}
