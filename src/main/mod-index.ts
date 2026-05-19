import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { app } from 'electron'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const INDEX_URL =
    'https://github.com/ShulhaOleh/pd3-mod-index/releases/download/latest-index/index.db'
const INDEX_PATH = join(app.getPath('userData'), 'mod-index.db')
const MAX_AGE_MS = 60 * 60 * 1000

export interface IndexMatch {
    modRemoteId: number
    modName: string
    fileRemoteId: number
    version: string
}

let SQL: SqlJsStatic | null = null
let db: Database | null = null

async function initSQL(): Promise<SqlJsStatic> {
    if (SQL) return SQL
    SQL = await initSqlJs({
        locateFile: (file) =>
            app.isPackaged
                ? join(
                      process.resourcesPath,
                      'app.asar.unpacked',
                      'node_modules',
                      'sql.js',
                      'dist',
                      file
                  )
                : join(__dirname, '../../node_modules/sql.js/dist', file),
    })
    return SQL
}

async function getDb(): Promise<Database | null> {
    if (db) return db
    if (!existsSync(INDEX_PATH)) return null
    try {
        const sqljs = await initSQL()
        db = new sqljs.Database(readFileSync(INDEX_PATH))
    } catch (e) {
        console.error('[mod-index] failed to open DB:', e)
        return null
    }
    return db
}

export async function ensureIndex(): Promise<void> {
    if (existsSync(INDEX_PATH)) {
        const age = Date.now() - statSync(INDEX_PATH).mtimeMs
        if (age < MAX_AGE_MS) return
        db?.close()
        db = null
    }
    const res = await fetch(INDEX_URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`mod index download failed: ${res.status}`)
    writeFileSync(INDEX_PATH, Buffer.from(await res.arrayBuffer()))
}

export async function lookupSha256(sha256: string): Promise<IndexMatch | null> {
    const database = await getDb()
    if (!database) return null
    const stmt = database.prepare(
        `SELECT m.remote_id AS modRemoteId, m.name AS modName,
                f.remote_id AS fileRemoteId, f.version
         FROM files f
         JOIN mods m ON m.id = f.mod_id
         WHERE f.sha256 = ?
         LIMIT 1`
    )
    stmt.bind([sha256])
    if (!stmt.step()) {
        stmt.free()
        return null
    }
    const row = stmt.getAsObject() as unknown as IndexMatch
    stmt.free()
    return row
}

export async function lookupByName(name: string): Promise<number | null> {
    const database = await getDb()
    if (!database) return null
    const stmt = database.prepare(`SELECT remote_id FROM mods WHERE name LIKE ? LIMIT 2`)
    stmt.bind([`%${name}%`])
    const rows: number[] = []
    while (stmt.step()) {
        rows.push((stmt.getAsObject() as { remote_id: number }).remote_id)
    }
    stmt.free()
    return rows.length === 1 ? rows[0] : null
}
