import type { GameId } from '../../shared/types'
import type { GameSettings } from './api'

export interface SettingsCacheEntry {
    settings: GameSettings
    installedLaunchers: string[]
}

// Session cache for SettingsPage data, mirroring gamePathCache/installedCache in
// App.tsx: the page sync-initializes from the last fetched values on remount and
// revalidates in the background, so repeat visits never flash default values.
const cache = new Map<GameId, SettingsCacheEntry>()

export function getSettingsCache(game: GameId): SettingsCacheEntry | undefined {
    return cache.get(game)
}

export function setSettingsCache(game: GameId, entry: SettingsCacheEntry): void {
    cache.set(game, entry)
}

// User mutations on the settings page must patch the cache too, or the next
// remount restores the pre-mutation values until the background revalidate lands.
export function patchSettingsCache(game: GameId, patch: Partial<GameSettings>): void {
    const entry = cache.get(game)
    if (entry) cache.set(game, { ...entry, settings: { ...entry.settings, ...patch } })
}
