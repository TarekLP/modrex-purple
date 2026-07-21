import { INDEX_STATS_URL, type ModIndexStatsPayload } from './mod-index-shared'

export interface ModIndexStats {
    supportedMods: number
}

// Build-time only: read the recognized-mod count from the tiny index-stats.json asset that the
// modrex-index pipeline publishes next to index.db. Downloading the full index.db here and
// counting it with sql.js meant every build pulled the whole multi-megabyte database (which
// grows with the catalog) just to render one number the JSON already carries. The browser
// refresh in Features.astro already reads this same asset.
export async function getModIndexStats(): Promise<ModIndexStats> {
    const res = await fetch(INDEX_STATS_URL)
    if (!res.ok) throw new Error(`Index stats download error: ${res.status}`)
    const stats = (await res.json()) as ModIndexStatsPayload
    return { supportedMods: stats.supportedMods }
}
