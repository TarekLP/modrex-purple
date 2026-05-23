import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))
vi.mock('fs')

import * as fs from 'fs'
import { EpicLauncher } from './epic'
import type { GameDef } from './types'

afterEach(() => vi.clearAllMocks())

const GAME: GameDef = {
    id: 'pd3',
    name: 'PAYDAY 3',
    executable: 'PAYDAY3.exe',
    modsPath: 'PAYDAY3/Content/Paks/~mods',
    modExtensions: ['.pak'],
    launchers: {
        epic: { displayName: 'PAYDAY 3', slug: 'payday-3' },
    },
}

describe('EpicLauncher.identifyPath', () => {
    it('returns true when .egstore folder exists', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.egstore'))
        expect(EpicLauncher.identifyPath('D:\\Some\\Game')).toBe(true)
    })

    it('returns false when .egstore folder is absent', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false)
        expect(EpicLauncher.identifyPath('D:\\Some\\Game')).toBe(false)
    })
})

describe('EpicLauncher.findGame', () => {
    it('returns InstallLocation when DisplayName matches', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true)
        vi.mocked(fs.readdirSync).mockReturnValue(['abc.item'] as any)
        vi.mocked(fs.readFileSync).mockReturnValue(
            JSON.stringify({
                DisplayName: 'PAYDAY 3',
                InstallLocation: 'D:\\Epic Games\\PAYDAY 3',
                AppName: 'Payday3',
            }) as any
        )
        expect(EpicLauncher.findGame(GAME)).toBe('D:\\Epic Games\\PAYDAY 3')
    })

    it('returns null when no manifest has a matching DisplayName', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true)
        vi.mocked(fs.readdirSync).mockReturnValue(['abc.item'] as any)
        vi.mocked(fs.readFileSync).mockReturnValue(
            JSON.stringify({
                DisplayName: 'Some Other Game',
                InstallLocation: 'D:\\Epic Games\\Other',
                AppName: 'OtherGame',
            }) as any
        )
        expect(EpicLauncher.findGame(GAME)).toBeNull()
    })

    it('returns null when manifest directory does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false)
        expect(EpicLauncher.findGame(GAME)).toBeNull()
    })

    it('skips malformed manifest files and continues to next', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true)
        vi.mocked(fs.readdirSync).mockReturnValue(['bad.item', 'good.item'] as any)
        vi.mocked(fs.readFileSync)
            .mockReturnValueOnce('not valid json' as any)
            .mockReturnValueOnce(
                JSON.stringify({
                    DisplayName: 'PAYDAY 3',
                    InstallLocation: 'D:\\Epic Games\\PAYDAY 3',
                    AppName: 'Payday3',
                }) as any
            )
        expect(EpicLauncher.findGame(GAME)).toBe('D:\\Epic Games\\PAYDAY 3')
    })

    it('returns null when game has no epic launcher config', () => {
        const gameWithoutEpic: GameDef = { ...GAME, launchers: {} }
        expect(EpicLauncher.findGame(gameWithoutEpic)).toBeNull()
    })
})
