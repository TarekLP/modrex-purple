import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import initSqlJs from 'sql.js'
import { mkdirSync, rmSync, writeFileSync, existsSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureIndex, lookupSha256 } from './mod-index'

vi.mock('electron', () => ({
    app: {
        getPath: () => join(tmpdir(), 'pd3-mm-test-mod-index'),
        isPackaged: false,
        getVersion: () => '0.0.0-test',
    },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const TEST_DIR = join(tmpdir(), 'pd3-mm-test-mod-index')
const INDEX_PATH = join(TEST_DIR, 'mod-index.db')

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }))
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }))
afterEach(() => vi.clearAllMocks())

// --- ensureIndex ---

describe('ensureIndex', () => {
    afterEach(() => rmSync(INDEX_PATH, { force: true }))

    it('downloads and writes index when file is absent', async () => {
        const bytes = Buffer.from('fake-db')
        mockFetch.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(bytes.buffer) })
        await ensureIndex()
        expect(existsSync(INDEX_PATH)).toBe(true)
        expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('skips download when file is fresh', async () => {
        writeFileSync(INDEX_PATH, 'content')
        await ensureIndex()
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('re-downloads when file is stale', async () => {
        writeFileSync(INDEX_PATH, 'old')
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
        utimesSync(INDEX_PATH, twoHoursAgo, twoHoursAgo)
        mockFetch.mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(Buffer.from('new').buffer),
        })
        await ensureIndex()
        expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('throws when download fails', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 503 })
        await expect(ensureIndex()).rejects.toThrow('503')
    })
})

// --- lookupSha256 ---

const TEST_SHA256 = 'a'.repeat(64)

async function writeTestDb(): Promise<void> {
    const SQL = await initSqlJs({
        locateFile: (f) => join(__dirname, '../../node_modules/sql.js/dist', f),
    })
    const db = new SQL.Database()
    db.run(`
        CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
        CREATE TABLE sources (id INTEGER PRIMARY KEY, game_id INTEGER NOT NULL, name TEXT NOT NULL, base_url TEXT NOT NULL, game_ref TEXT NOT NULL);
        CREATE TABLE mods (id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL, remote_id INTEGER NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL);
        CREATE TABLE file_contents (sha256 TEXT PRIMARY KEY);
        CREATE TABLE files (id INTEGER PRIMARY KEY, mod_id INTEGER NOT NULL, sha256 TEXT NOT NULL, remote_id INTEGER NOT NULL, version TEXT NOT NULL, indexed_at TEXT NOT NULL);
        CREATE INDEX idx_files_sha256 ON files(sha256);
    `)
    db.run(`INSERT INTO games VALUES (1, 'PAYDAY 3', 'pd3')`)
    db.run(`INSERT INTO sources VALUES (1, 1, 'modworkshop', 'https://api.modworkshop.net', '853')`)
    db.run(`INSERT INTO mods VALUES (1, 1, 55590, 'TestMod', 'https://modworkshop.net/mod/55590')`)
    db.run(`INSERT INTO file_contents VALUES ('${TEST_SHA256}')`)
    db.run(`INSERT INTO files VALUES (1, 1, '${TEST_SHA256}', 11111, '1.0.0', '2026-01-01')`)
    writeFileSync(INDEX_PATH, Buffer.from(db.export()))
    db.close()
}

describe('lookupSha256', () => {
    it('returns null when DB file is absent', async () => {
        expect(await lookupSha256(TEST_SHA256)).toBeNull()
    })

    describe('with DB loaded', () => {
        beforeAll(async () => writeTestDb())
        afterAll(() => rmSync(INDEX_PATH, { force: true }))

        it('returns null for unknown sha256', async () => {
            expect(await lookupSha256('0'.repeat(64))).toBeNull()
        })

        it('returns correct fields for known sha256', async () => {
            expect(await lookupSha256(TEST_SHA256)).toEqual({
                modRemoteId: 55590,
                modName: 'TestMod',
                fileRemoteId: 11111,
                version: '1.0.0',
            })
        })
    })
})
