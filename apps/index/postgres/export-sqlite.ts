import Database from 'better-sqlite3'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { GAME_IDS, isGameId } from '@modrex/games'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.INDEX_DATABASE_URL
if (!databaseUrl) throw new Error('INDEX_DATABASE_URL is required')

const game = process.argv.find((argument) => argument.startsWith('--game='))?.slice(7) ?? null
if (!isGameId(game)) throw new Error(`--game must be one of ${GAME_IDS.join(', ')}`)

const output = process.argv.find((argument) => argument.startsWith('--output='))?.slice(9)
if (!output) throw new Error('--output is required')
const requireFiles = process.argv.includes('--require-files')

const outputPath = resolve(output)
const temporaryPath = `${outputPath}.tmp`
const sql = neon(databaseUrl)

interface CatalogRow {
    game_id: string
    game_name: string
    game_slug: string
    source_id: string
    source_name: string
    source_base_url: string
    source_game_ref: string
}

interface ExportRow {
    mod_id: string
    mod_remote_id: string
    mod_name: string
    mod_url: string
    file_id: string
    file_sha256: string
    file_remote_id: string
    file_version: string
    file_indexed_at: string
    file_entry_name: string
}

const schema = `
    PRAGMA foreign_keys = ON;
    CREATE TABLE games (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE
    );
    CREATE TABLE sources (
        id INTEGER PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES games(id),
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        game_ref TEXT NOT NULL
    );
    CREATE TABLE mods (
        id INTEGER PRIMARY KEY,
        source_id INTEGER NOT NULL REFERENCES sources(id),
        remote_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        UNIQUE(source_id, remote_id)
    );
    CREATE TABLE file_contents (sha256 TEXT PRIMARY KEY);
    CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        mod_id INTEGER NOT NULL REFERENCES mods(id),
        sha256 TEXT NOT NULL REFERENCES file_contents(sha256),
        remote_id INTEGER NOT NULL,
        version TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        entry_name TEXT NOT NULL DEFAULT '',
        UNIQUE(mod_id, sha256)
    );
    CREATE INDEX idx_files_sha256 ON files(sha256);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

rmSync(temporaryPath, { force: true })
mkdirSync(dirname(outputPath), { recursive: true })

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
`) as ExportRow[]
if (requireFiles && rows.length === 0) throw new Error(`no indexed file records exist for ${game}`)

const catalog = (await sql`
    SELECT games.id AS game_id, games.name AS game_name, games.slug AS game_slug,
           sources.id AS source_id, sources.name AS source_name,
           sources.base_url AS source_base_url, sources.game_ref AS source_game_ref
    FROM sources
    JOIN games ON games.id = sources.game_id
    WHERE games.slug = ${game} AND sources.name = 'modworkshop'
`) as CatalogRow[]
if (catalog.length !== 1) throw new Error(`missing ModWorkshop catalog source for ${game}`)

const db = new Database(temporaryPath)
try {
    db.exec(schema)
    const insertGame = db.prepare('INSERT INTO games VALUES (?, ?, ?)')
    const insertSource = db.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?)')
    const insertMod = db.prepare('INSERT INTO mods VALUES (?, ?, ?, ?, ?)')
    const insertContent = db.prepare('INSERT INTO file_contents VALUES (?)')
    const insertFile = db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?)')
    const insertMetadata = db.prepare('INSERT INTO metadata VALUES (?, ?)')
    const seen = { mods: new Set<string>(), contents: new Set<string>() }
    const source = catalog[0]

    db.transaction(() => {
        insertGame.run(source.game_id, source.game_name, source.game_slug)
        insertSource.run(
            source.source_id,
            source.game_id,
            source.source_name,
            source.source_base_url,
            source.source_game_ref
        )
        for (const row of rows) {
            if (!seen.mods.has(row.mod_id)) {
                insertMod.run(
                    row.mod_id,
                    source.source_id,
                    row.mod_remote_id,
                    row.mod_name,
                    row.mod_url
                )
                seen.mods.add(row.mod_id)
            }
            if (!seen.contents.has(row.file_sha256)) {
                insertContent.run(row.file_sha256)
                seen.contents.add(row.file_sha256)
            }
            insertFile.run(
                row.file_id,
                row.mod_id,
                row.file_sha256,
                row.file_remote_id,
                row.file_version,
                row.file_indexed_at,
                row.file_entry_name
            )
        }
        insertMetadata.run('exported_at', new Date().toISOString())
        insertMetadata.run('game', game)
    })()
    db.pragma('optimize')
    db.close()
    renameSync(temporaryPath, outputPath)
} catch (error) {
    db.close()
    rmSync(temporaryPath, { force: true })
    throw error
}

console.log(`Exported ${rows.length} file records for ${game} to ${outputPath}`)
