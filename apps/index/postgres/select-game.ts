import { GAME_IDS } from '@modrex/games'
import { neon } from '@neondatabase/serverless'

import { chooseNextGame, turnKey, type ScheduleCandidate } from './game-schedule.js'

const databaseUrl = process.env.INDEX_DATABASE_URL
if (!databaseUrl) throw new Error('INDEX_DATABASE_URL is required')

const sql = neon(databaseUrl)

// Pending means the same thing here as in the processor's own selection, so the two
// predicates have to stay in step: see the listings query in process-content.ts.
const pendingRows = (await sql`
    SELECT
        games.slug,
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
`) as Array<{ slug: string; pending: string }>

const turnRows = (await sql.query('SELECT key, value FROM metadata WHERE key = ANY($1::TEXT[])', [
    GAME_IDS.map(turnKey),
])) as Array<{ key: string; value: string }>

const turnByKey = new Map<string, number>()
for (const row of turnRows) {
    const turn = Number(row.value)
    if (!Number.isInteger(turn) || turn < 1) {
        throw new Error(`Invalid scheduler turn for ${row.key}: ${row.value}`)
    }
    turnByKey.set(row.key, turn)
}

const pendingByGame = new Map(pendingRows.map((row) => [row.slug, Number(row.pending)]))
const maxTurn = Math.max(0, ...turnByKey.values())

const candidates: ScheduleCandidate[] = []
for (const game of GAME_IDS) {
    const pending = pendingByGame.get(game) ?? 0
    if (pending === 0) continue
    candidates.push({ game, pending, lastTurn: turnByKey.get(turnKey(game)) ?? null })
}

const next = chooseNextGame(candidates, maxTurn)
if (!next) process.exit(0)

// The turn is recorded before the content processor runs, so a run that fails partway
// still spends the turn it was granted. Recording it on success instead would let a game
// whose processing keeps failing hold the front of the queue for as long as it fails.
await sql`
    INSERT INTO metadata (key, value)
    VALUES (${turnKey(next)}, ${String(maxTurn + 1)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
`
process.stdout.write(next)
