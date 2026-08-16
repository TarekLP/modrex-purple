import { GAME_IDS, isGameId } from '@modrex/games'
import { neon } from '@neondatabase/serverless'

import { writeSnapshot, type SnapshotRow, type SnapshotSource } from './snapshot.js'

const databaseUrl = process.env.INDEX_DATABASE_URL
if (!databaseUrl) throw new Error('INDEX_DATABASE_URL is required')

const game = process.argv.find((argument) => argument.startsWith('--game='))?.slice(7) ?? null
if (!isGameId(game)) throw new Error(`--game must be one of ${GAME_IDS.join(', ')}`)

const output = process.argv.find((argument) => argument.startsWith('--output='))?.slice(9)
if (!output) throw new Error('--output is required')
const requireFiles = process.argv.includes('--require-files')

const sql = neon(databaseUrl)

const rows = (await sql`
    SELECT mods.id AS mod_id, mods.remote_id AS mod_remote_id, mods.name AS mod_name, mods.url AS mod_url,
           files.id AS file_id, files.sha256 AS file_sha256, files.remote_id AS file_remote_id,
           files.version AS file_version, files.indexed_at AS file_indexed_at, files.entry_name AS file_entry_name
    FROM files
    JOIN mods ON mods.id = files.mod_id
    JOIN sources ON sources.id = mods.source_id
    JOIN games ON games.id = sources.game_id
    WHERE games.slug = ${game}
    ORDER BY files.id
`) as SnapshotRow[]
if (requireFiles && rows.length === 0) throw new Error(`no indexed file records exist for ${game}`)

const catalog = (await sql`
    SELECT games.id AS game_id, games.name AS game_name, games.slug AS game_slug,
           sources.id AS source_id, sources.name AS source_name,
           sources.base_url AS source_base_url, sources.game_ref AS source_game_ref
    FROM sources
    JOIN games ON games.id = sources.game_id
    WHERE games.slug = ${game} AND sources.name = 'modworkshop'
`) as SnapshotSource[]
if (catalog.length !== 1) throw new Error(`missing ModWorkshop catalog source for ${game}`)

const outputPath = writeSnapshot(output, game, catalog[0], rows)
console.log(`Exported ${rows.length} file records for ${game} to ${outputPath}`)
