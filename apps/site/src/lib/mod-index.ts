import { INDEX_STATS_URL, type ModIndexStatsPayload } from './mod-index-shared'

export interface ModIndexStats {
    supportedMods: number
}

// Build-time only: read the recognized-mod count from the R2 catalog manifest. Downloading a
// database just to count its mods would make every site build fetch a multi-megabyte asset.
export async function getModIndexStats(): Promise<ModIndexStats | null> {
    const res = await fetch(INDEX_STATS_URL)
    if (!res.ok) throw new Error(`Index stats download error: ${res.status}`)
    const stats = (await res.json()) as ModIndexStatsPayload
    const supportedMods = stats.stats?.supportedMods
    if (typeof supportedMods !== 'number' || !Number.isFinite(supportedMods)) {
        return null
    }
    return { supportedMods }
}
