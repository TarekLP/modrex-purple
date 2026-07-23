export const INDEX_STATS_URL = 'https://index.modrex.net/catalog/latest.json'

export interface ModIndexStatsPayload {
    stats?: {
        supportedMods: number
        generatedAt: string
    }
}
