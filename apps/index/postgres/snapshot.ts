import Database from 'better-sqlite3'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface SnapshotSource {
    game_id: string
    game_name: string
    game_slug: string
    source_id: string
    source_name: string
    source_base_url: string
    source_game_ref: string
}

export interface SnapshotRow {
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

// The published file has to be a function of the catalog and nothing else. The workflow decides
// whether to upload a new immutable generation by comparing this file's SHA256 against the one
// in catalog/latest.json, so anything that varies between two exports of the same rows, a clock
// reading most of all, turns every run into a new generation and makes every desktop client
// re-download a snapshot it already has. Rows arrive ordered by files.id and are written in that
// order, which is what makes the byte layout reproducible.
export function writeSnapshot(
    output: string,
    game: string,
    source: SnapshotSource,
    rows: SnapshotRow[]
): string {
    const outputPath = resolve(output)
    const temporaryPath = `${outputPath}.tmp`
    rmSync(temporaryPath, { force: true })
    mkdirSync(dirname(outputPath), { recursive: true })

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
    return outputPath
}
