#!/usr/bin/env npx tsx
/**
 * Migrates index.json → index.db (SQLite) with the full normalized schema.
 *
 * Run: npx tsx scripts/migrate-to-sqlite.ts
 */

import Database from 'better-sqlite3'
import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

const JSON_INPUT = join(import.meta.dirname, 'index.json')
const DB_OUTPUT = join(import.meta.dirname, 'index.db')

interface IndexEntry {
    modId: number
    fileId: number
    modName: string
    version: string
}

interface Index {
    generated: string
    count: number
    index: Record<string, IndexEntry>
}

// --- schema ---

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sources (
    id       INTEGER PRIMARY KEY,
    game_id  INTEGER NOT NULL REFERENCES games(id),
    name     TEXT NOT NULL,
    base_url TEXT NOT NULL,
    game_ref TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mods (
    id        INTEGER PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES sources(id),
    remote_id INTEGER NOT NULL,
    name      TEXT NOT NULL,
    url       TEXT NOT NULL,
    UNIQUE(source_id, remote_id)
);

CREATE TABLE IF NOT EXISTS file_contents (
    sha256 TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS files (
    id         INTEGER PRIMARY KEY,
    mod_id     INTEGER NOT NULL REFERENCES mods(id),
    sha256     TEXT NOT NULL REFERENCES file_contents(sha256),
    remote_id  INTEGER NOT NULL,
    version    TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    UNIQUE(mod_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
`

// --- main ---

function main(): void {
    if (!existsSync(JSON_INPUT)) {
        console.error(`index.json not found at ${JSON_INPUT}`)
        process.exit(1)
    }

    console.log('Reading index.json...')
    const raw = JSON.parse(readFileSync(JSON_INPUT, 'utf8')) as Index
    const entries = Object.entries(raw.index)
    console.log(`  ${entries.length} entries to migrate\n`)

    if (existsSync(DB_OUTPUT)) {
        console.log('Removing existing index.db...')
        rmSync(DB_OUTPUT)
    }

    const db = new Database(DB_OUTPUT)
    db.exec(SCHEMA)

    // seed game + source
    const insertGame = db.prepare('INSERT OR IGNORE INTO games (name, slug) VALUES (?, ?)')
    const insertSource = db.prepare(
        'INSERT OR IGNORE INTO sources (game_id, name, base_url, game_ref) VALUES (?, ?, ?, ?)'
    )

    insertGame.run('PAYDAY 3', 'pd3')
    const game = db.prepare('SELECT id FROM games WHERE slug = ?').get('pd3') as { id: number }

    insertSource.run(game.id, 'modworkshop', 'https://api.modworkshop.net', '853')
    const source = db.prepare('SELECT id FROM sources WHERE name = ?').get('modworkshop') as {
        id: number
    }

    const insertMod = db.prepare(
        'INSERT OR IGNORE INTO mods (source_id, remote_id, name, url) VALUES (?, ?, ?, ?)'
    )
    const getMod = db.prepare('SELECT id FROM mods WHERE source_id = ? AND remote_id = ?')
    const insertContent = db.prepare('INSERT OR IGNORE INTO file_contents (sha256) VALUES (?)')
    const insertFile = db.prepare(
        'INSERT OR IGNORE INTO files (mod_id, sha256, remote_id, version, indexed_at) VALUES (?, ?, ?, ?, ?)'
    )

    const migrate = db.transaction(() => {
        for (const [sha256, entry] of entries) {
            const modUrl = `https://modworkshop.net/mod/${entry.modId}`
            insertMod.run(source.id, entry.modId, entry.modName, modUrl)
            const mod = getMod.get(source.id, entry.modId) as { id: number }

            insertContent.run(sha256)
            insertFile.run(mod.id, sha256, entry.fileId, entry.version, raw.generated)
        }
    })

    console.log('Migrating...')
    migrate()

    const count = (db.prepare('SELECT COUNT(*) as n FROM files').get() as { n: number }).n
    console.log(`Done. ${count} files written to ${DB_OUTPUT}`)

    db.close()
}

main()
