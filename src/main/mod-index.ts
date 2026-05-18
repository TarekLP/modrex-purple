import { app } from 'electron'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const INDEX_URL =
    'https://github.com/ShulhaOleh/pd3-mod-index/releases/download/latest-index/sha256-index.json'
const INDEX_PATH = join(app.getPath('userData'), 'mod-sha256-index.json')
const MAX_AGE_MS = 60 * 60 * 1000

export interface IndexMatch {
    modRemoteId: number
    modName: string
    fileRemoteId: number
    version: string
}

let index: Record<string, IndexMatch> | null = null

function getIndex(): Record<string, IndexMatch> | null {
    if (index) return index
    if (!existsSync(INDEX_PATH)) return null
    try {
        index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'))
    } catch (e) {
        console.error('[mod-index] failed to parse JSON:', e)
        return null
    }
    return index
}

export async function ensureIndex(): Promise<void> {
    if (existsSync(INDEX_PATH)) {
        const age = Date.now() - statSync(INDEX_PATH).mtimeMs
        if (age < MAX_AGE_MS) return
        index = null
    }
    const res = await fetch(INDEX_URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`mod index download failed: ${res.status}`)
    writeFileSync(INDEX_PATH, await res.text())
}

export function lookupSha256(sha256: string): IndexMatch | null {
    return getIndex()?.[sha256] ?? null
}
