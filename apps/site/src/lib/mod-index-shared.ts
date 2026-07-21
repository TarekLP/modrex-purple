export const INDEX_STATS_URL =
    'https://github.com/modrexio/modrex-index/releases/download/latest-index/index-stats.json'

export interface ModIndexStatsPayload {
    supportedMods: number
    generatedAt: string
}
