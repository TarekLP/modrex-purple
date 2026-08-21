import { MODWORKSHOP_GAME_IDS, MODWORKSHOP_GAMES } from '../modworkshop-games.js'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.INDEX_DATABASE_URL
if (!databaseUrl) throw new Error('INDEX_DATABASE_URL is required')

const sql = neon(databaseUrl)
const rows = (await sql`
    SELECT games.slug, games.name, sources.game_ref
    FROM games
    JOIN sources ON sources.game_id = games.id
    WHERE sources.name = 'modworkshop'
    ORDER BY games.slug
`) as { slug: string; name: string; game_ref: string }[]

if (rows.length !== MODWORKSHOP_GAME_IDS.length) {
    throw new Error(
        `Expected ${MODWORKSHOP_GAME_IDS.length} ModWorkshop sources, found ${rows.length}`
    )
}

for (const slug of MODWORKSHOP_GAME_IDS) {
    const game = MODWORKSHOP_GAMES[slug]
    const row = rows.find((candidate) => candidate.slug === slug)
    if (!row) throw new Error(`Missing ${slug} ModWorkshop source`)
    if (row.name !== game.name) throw new Error(`${slug} name does not match @modrex/games`)
    if (row.game_ref !== String(game.workshopId)) {
        throw new Error(`${slug} ModWorkshop ID does not match @modrex/games`)
    }
}

console.log(`Verified ${rows.length} Postgres game sources`)
