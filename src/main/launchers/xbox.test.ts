import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'path'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))
vi.mock('fs')
vi.mock('child_process')

import * as fs from 'fs'
import * as cp from 'child_process'
import { shell } from 'electron'
import { XboxLauncher } from './xbox'
import type { GameDef } from './types'

afterEach(() => vi.clearAllMocks())

const GAME: GameDef = {
    id: 'pd3',
    name: 'PAYDAY 3',
    executable: 'PAYDAY3.exe',
    modsPath: 'PAYDAY3/Content/Paks/~mods',
    modExtensions: ['.pak'],
    launchers: {
        xbox: {
            productId: '9NPZVDCH73SX',
            executable: 'PAYDAY3/Binaries/WinGDK/PAYDAY3-WinGDK-Shipping.exe',
        },
    },
}

describe('XboxLauncher.identifyPath', () => {
    it('returns true when MicrosoftGame.config exists', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            String(p).endsWith('MicrosoftGame.config')
        )
        expect(XboxLauncher.identifyPath('C:\\XboxGames\\PAYDAY 3')).toBe(true)
    })

    it('returns false when MicrosoftGame.config is absent', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false)
        expect(XboxLauncher.identifyPath('C:\\XboxGames\\PAYDAY 3')).toBe(false)
    })
})

describe('XboxLauncher.findGame', () => {
    it('returns path when game executable is found in a drive subdirectory', () => {
        vi.mocked(fs.readdirSync).mockReturnValue(['XboxGames'] as any)
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            const s = String(p)
            return s === 'C:\\' || s.endsWith('PAYDAY3-WinGDK-Shipping.exe')
        })
        const result = XboxLauncher.findGame(GAME)
        expect(result).toMatch(/XboxGames[\\/]PAYDAY 3[\\/]Content$/)
    })

    it('finds game in non-standard install location', () => {
        vi.mocked(fs.readdirSync).mockReturnValue(['Games'] as any)
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            const s = String(p)
            return s === 'D:\\' || s.endsWith('PAYDAY3-WinGDK-Shipping.exe')
        })
        const result = XboxLauncher.findGame(GAME)
        expect(result).toMatch(/Games[\\/]PAYDAY 3[\\/]Content$/)
    })

    it('falls back to package manager for deeply nested install locations', () => {
        vi.mocked(fs.readdirSync).mockReturnValue([])
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            String(p).endsWith('PAYDAY3-WinGDK-Shipping.exe')
        )
        vi.mocked(cp.execSync).mockReturnValue('D:\\Deep\\Games\\PAYDAY 3\\Content\n' as any)
        const result = XboxLauncher.findGame(GAME)
        expect(result).toBe('D:\\Deep\\Games\\PAYDAY 3\\Content')
    })

    it('returns null when game is not found on any drive', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false)
        expect(XboxLauncher.findGame(GAME)).toBeNull()
    })

    it('returns null when game has no xbox launcher config', () => {
        const gameWithoutXbox: GameDef = { ...GAME, launchers: {} }
        expect(XboxLauncher.findGame(gameWithoutXbox)).toBeNull()
    })
})

describe('XboxLauncher.launch', () => {
    it('spawns gamelaunchhelper.exe when it exists', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true)
        const mockChild = { unref: vi.fn() }
        vi.mocked(cp.spawn).mockReturnValue(mockChild as any)

        XboxLauncher.launch(GAME, 'C:\\XboxGames\\PAYDAY 3\\Content')

        expect(cp.spawn).toHaveBeenCalledWith(
            join('C:\\XboxGames\\PAYDAY 3\\Content', 'gamelaunchhelper.exe'),
            [],
            { detached: true, stdio: 'ignore' }
        )
        expect(mockChild.unref).toHaveBeenCalled()
    })

    it('falls back to msxbox URI when gamelaunchhelper.exe is not found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false)

        XboxLauncher.launch(GAME, 'C:\\XboxGames\\PAYDAY 3\\Content')

        expect(shell.openExternal).toHaveBeenCalledWith('msxbox://game/?productId=9NPZVDCH73SX')
    })
})
