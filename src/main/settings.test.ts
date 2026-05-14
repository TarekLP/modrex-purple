import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readSettings, writeSettings } from './settings'

let tmp: string
let settingsPath: string

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'pd3-settings-test-'))
    settingsPath = join(tmp, 'settings.json')
})

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
})

describe('readSettings', () => {
    it('returns empty object when file does not exist', () => {
        expect(readSettings(settingsPath)).toEqual({})
    })

    it('returns empty object when file contains invalid JSON', () => {
        writeFileSync(settingsPath, 'not json')
        expect(readSettings(settingsPath)).toEqual({})
    })

    it('reads gamePath from file', () => {
        writeFileSync(settingsPath, JSON.stringify({ gamePath: 'G:\\games\\PAYDAY3' }))
        expect(readSettings(settingsPath).gamePath).toBe('G:\\games\\PAYDAY3')
    })

    it('reads launchOptions from file', () => {
        writeFileSync(settingsPath, JSON.stringify({ launchOptions: '-high -dx12' }))
        expect(readSettings(settingsPath).launchOptions).toBe('-high -dx12')
    })

    it('reads skipFileOpenLogWarning from file', () => {
        writeFileSync(settingsPath, JSON.stringify({ skipFileOpenLogWarning: true }))
        expect(readSettings(settingsPath).skipFileOpenLogWarning).toBe(true)
    })
})

describe('writeSettings', () => {
    it('persists settings that can be read back', () => {
        const settings = {
            gamePath: 'C:\\games',
            launchOptions: '-fileopenlog',
            skipFileOpenLogWarning: true,
        }
        writeSettings(settingsPath, settings)
        expect(readSettings(settingsPath)).toEqual(settings)
    })

    it('overwrites existing settings', () => {
        writeSettings(settingsPath, { gamePath: 'old' })
        writeSettings(settingsPath, { gamePath: 'new' })
        expect(readSettings(settingsPath).gamePath).toBe('new')
    })

    it('writes partial settings without losing undefined fields', () => {
        writeSettings(settingsPath, { launchOptions: '-high' })
        const result = readSettings(settingsPath)
        expect(result.launchOptions).toBe('-high')
        expect(result.gamePath).toBeUndefined()
    })
})
