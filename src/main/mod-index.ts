import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, statSync, writeFileSync } from 'fs'
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

let db: InstanceType<typeof Database> | null = null

function getDb(): InstanceType<typeof Database> | null {
    if (db) return db
    if (!existsSync(INDEX_PATH)) return null
    db = new Database(INDEX_PATH, { readonly: true })
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

export function lookupSha256(sha256: string): IndexMatch | null {
    const database = getDb()
    if (!database) return null
    const row = database
        .prepare(
            `SELECT m.remote_id AS modRemoteId, m.name AS modName,
                    f.remote_id AS fileRemoteId, f.version
             FROM files f
             JOIN mods m ON m.id = f.mod_id
             WHERE f.sha256 = ?
             LIMIT 1`
        )
        .get(sha256) as IndexMatch | undefined
    return row ?? null
}
