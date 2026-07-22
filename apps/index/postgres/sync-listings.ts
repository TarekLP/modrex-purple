import { GAME_IDS, GAMES } from '@modrex/games'
import { neon } from '@neondatabase/serverless'

interface ModListing {
    id: number
    name: string
    version: string
    has_download: boolean
    bumped_at: string
    updated_at: string
    download_id: number | null
    download_type: string | null
}

interface Paginated<T> {
    data: T[]
    meta: { current_page: number; last_page: number }
}

const databaseUrl = process.env.INDEX_DATABASE_URL
if (!databaseUrl) throw new Error('INDEX_DATABASE_URL is required')

const apiBase = process.env.MODWORKSHOP_API_BASE ?? 'https://api.modworkshop.net'
const userAgent = 'modrex-index-builder'
const apiMinimumIntervalMs = 700
const sinceBufferMs = 10 * 60 * 1000
const sql = neon(databaseUrl)

let nextApiSlot = 0

async function waitForApiSlot(): Promise<void> {
    const now = Date.now()
    const slot = Math.max(now, nextApiSlot)
    nextApiSlot = slot + apiMinimumIntervalMs
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now))
}

async function apiGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${apiBase}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))

    for (let attempt = 0; attempt < 5; attempt++) {
        await waitForApiSlot()
        let response: Response
        try {
            response = await fetch(url, {
                headers: { Accept: 'application/json', 'User-Agent': userAgent },
                signal: AbortSignal.timeout(30_000),
            })
        } catch (error) {
            if (attempt === 4) throw error
            await new Promise((resolve) => setTimeout(resolve, 2_000 * 2 ** attempt))
            continue
        }

        if (response.ok) return (await response.json()) as T
        if (response.status !== 408 && response.status !== 429 && response.status < 500) {
            throw new Error(`ModWorkshop API ${response.status}: ${path}`)
        }
        if (attempt === 4) {
            throw new Error(`ModWorkshop API ${response.status}: ${path} after retries`)
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000 * 2 ** attempt))
    }

    throw new Error(`ModWorkshop API request exhausted retries: ${path}`)
}

async function getLastListedAt(slug: string): Promise<Date | null> {
    const rows = (await sql`
        SELECT value
        FROM metadata
        WHERE key = ${`listings_last_run_at:${slug}`}
    `) as { value: string }[]
    if (rows.length === 0) return null

    const value = new Date(rows[0].value)
    if (Number.isNaN(value.getTime())) {
        throw new Error(`Invalid listings checkpoint for ${slug}: ${rows[0].value}`)
    }
    return value
}

async function storePage(slug: string, listings: ModListing[]): Promise<void> {
    if (listings.length === 0) return

    const stored = await sql.query(
        `WITH source AS (
            SELECT sources.id
            FROM sources
            JOIN games ON games.id = sources.game_id
            WHERE games.slug = $1 AND sources.name = 'modworkshop'
        )
        INSERT INTO mod_listings (
            source_id, remote_id, name, version, has_download, bumped_at, updated_at, download_id, download_type
        )
        SELECT
            source.id, listing.id, listing.name, listing.version, listing.has_download,
            listing.bumped_at, listing.updated_at, listing.download_id, listing.download_type
        FROM source
        CROSS JOIN jsonb_to_recordset($2::jsonb) AS listing(
            id BIGINT,
            name TEXT,
            version TEXT,
            has_download BOOLEAN,
            bumped_at TEXT,
            updated_at TEXT,
            download_id BIGINT,
            download_type TEXT
        )
        ON CONFLICT (source_id, remote_id) DO UPDATE SET
            name = EXCLUDED.name,
            version = EXCLUDED.version,
            has_download = EXCLUDED.has_download,
            bumped_at = EXCLUDED.bumped_at,
            updated_at = EXCLUDED.updated_at,
            download_id = EXCLUDED.download_id,
            download_type = EXCLUDED.download_type
        RETURNING remote_id`,
        [slug, JSON.stringify(listings)]
    )
    if (stored.length !== listings.length) {
        throw new Error(`Stored ${stored.length} of ${listings.length} ${slug} listings`)
    }
}

for (const slug of GAME_IDS) {
    const lastListedAt = await getLastListedAt(slug)
    const threshold = lastListedAt ? new Date(lastListedAt.getTime() - sinceBufferMs) : null
    const game = GAMES[slug]
    let page = 1
    let lastPage = 1
    let stored = 0

    do {
        const result = await apiGet<Paginated<ModListing>>(`/games/${game.workshopId}/mods`, {
            limit: 50,
            page,
            sort: 'bumped_at',
        })
        lastPage = result.meta.last_page
        const listings = threshold
            ? result.data.filter((listing) => new Date(listing.bumped_at) >= threshold)
            : result.data
        await storePage(slug, listings)
        stored += listings.length

        if (threshold && result.data.length > 0) {
            const oldest = new Date(result.data[result.data.length - 1].bumped_at)
            if (oldest < threshold) break
        }
        page++
    } while (page <= lastPage)

    await sql`
        INSERT INTO metadata (key, value)
        VALUES (${`listings_last_run_at:${slug}`}, ${new Date().toISOString()})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `
    console.log(`Synced ${stored} ${slug} listings`)
}
