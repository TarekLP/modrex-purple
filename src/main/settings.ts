import { existsSync, readFileSync, writeFileSync } from 'fs'

export interface Settings {
    gamePath?: string
}

export function readSettings(settingsPath: string): Settings {
    if (!existsSync(settingsPath)) return {}
    try {
        return JSON.parse(readFileSync(settingsPath, 'utf8'))
    } catch {
        return {}
    }
}

export function writeSettings(settingsPath: string, settings: Settings): void {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 4))
}
