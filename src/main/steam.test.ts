import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { parseSteamLibraryPath, buildGamePath } from './steam'

describe('parseSteamLibraryPath', () => {
    it('normalizes double backslashes from registry', () => {
        expect(parseSteamLibraryPath('foo\\\\bar')).toBe('foo\\bar')
    })

    it('leaves a path without double backslashes unchanged', () => {
        expect(parseSteamLibraryPath('foo\\bar')).toBe('foo\\bar')
    })
})

describe('buildGamePath', () => {
    it('appends PD3 relative path to any library root', () => {
        const base = 'library'
        expect(buildGamePath(base)).toBe(join(base, 'steamapps', 'common', 'PAYDAY3'))
    })
})
