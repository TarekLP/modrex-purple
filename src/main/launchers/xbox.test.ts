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
        xbox: { productId: '9NPZVDCH73SX', executable: 'PAYDAY3-WinGDK-Shipping.exe' },
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
    it('returns path when game executable is found in XboxGames', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            String(p).endsWith('PAYDAY3-WinGDK-Shipping.exe')
        )
        const result = XboxLauncher.findGame(GAME)
        expect(result).toMatch(/XboxGames[\\/]PAYDAY 3[\\/]Content$/)
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
    it('spawns the executable directly when it exists', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true)
        const mockChild = { unref: vi.fn() }
        vi.mocked(cp.spawn).mockReturnValue(mockChild as any)

        XboxLauncher.launch(GAME, 'C:\\XboxGames\\PAYDAY 3\\Content')

        expect(cp.spawn).toHaveBeenCalledWith(
            join('C:\\XboxGames\\PAYDAY 3\\Content', 'PAYDAY3-WinGDK-Shipping.exe'),
            [],
            { detached: true, stdio: 'ignore' }
        )
        expect(mockChild.unref).toHaveBeenCalled()
    })

    it('falls back to msxbox URI when executable is not found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false)

        XboxLauncher.launch(GAME, 'C:\\XboxGames\\PAYDAY 3\\Content')

        expect(shell.openExternal).toHaveBeenCalledWith('msxbox://game/?productId=9NPZVDCH73SX')
    })
})
