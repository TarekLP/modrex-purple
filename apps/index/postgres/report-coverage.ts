import { GAME_IDS } from '@modrex/games'
import { neon } from '@neondatabase/serverless'

interface CoverageRow {
    slug: string
    downloadable: string
    pending: string
}

const databaseUrl = process.env.INDEX_DATABASE_URL
if (!databaseUrl) throw new Error('INDEX_DATABASE_URL is required')

const sql = neon(databaseUrl)
const rows = (await sql`
    SELECT
        games.slug,
        COUNT(*) FILTER (WHERE mod_listings.has_download)::TEXT AS downloadable,
        COUNT(*) FILTER (
            WHERE mod_listings.has_download
              AND (mod_checks.remote_id IS NULL OR mod_checks.updated_at <> mod_listings.updated_at)
        )::TEXT AS pending
    FROM games
    JOIN sources ON sources.game_id = games.id
    LEFT JOIN mod_listings ON mod_listings.source_id = sources.id
    LEFT JOIN mod_checks ON mod_checks.source_id = mod_listings.source_id
                        AND mod_checks.remote_id = mod_listings.remote_id
    GROUP BY games.slug
`) as CoverageRow[]

const coverageByGame = new Map(rows.map((row) => [row.slug, row]))

for (const game of GAME_IDS) {
    const coverage = coverageByGame.get(game)
    const downloadable = Number(coverage?.downloadable ?? 0)
    const pending = Number(coverage?.pending ?? 0)
    console.log(`${game}: ${pending} pending of ${downloadable} downloadable listings`)
}
