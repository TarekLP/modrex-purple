import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { parseSteamLibraryPath, buildGamePath } from './launchers/steam'

describe('parseSteamLibraryPath', () => {
    it('normalizes double backslashes from registry', () => {
        expect(parseSteamLibraryPath('foo\\\\bar')).toBe('foo\\bar')
    })

    it('leaves a path without double backslashes unchanged', () => {
        expect(parseSteamLibraryPath('foo\\bar')).toBe('foo\\bar')
    })
})

describe('buildGamePath', () => {
    it('appends the given folder name inside steamapps/common', () => {
        const base = 'library'
        expect(buildGamePath(base, 'PAYDAY3')).toBe(join(base, 'steamapps', 'common', 'PAYDAY3'))
    })
})
