import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))
vi.mock('child_process')

vi.mock('./steam', () => ({
    SteamLauncher: {
        id: 'steam',
        name: 'Steam',
        isInstalled: vi.fn(),
        findGame: vi.fn(),
        identifyPath: vi.fn(),
        launch: vi.fn(),
    },
}))
vi.mock('./epic', () => ({
    EpicLauncher: {
        id: 'epic',
        name: 'Epic Games',
        isInstalled: vi.fn(),
        findGame: vi.fn(),
        identifyPath: vi.fn(),
        launch: vi.fn(),
    },
}))
vi.mock('./xbox', () => ({
    XboxLauncher: {
        id: 'xbox',
        name: 'Xbox',
        isInstalled: vi.fn(),
        findGame: vi.fn(),
        identifyPath: vi.fn(),
        launch: vi.fn(),
    },
}))

import * as cp from 'child_process'
import { SteamLauncher } from './steam'
import { EpicLauncher } from './epic'
import { XboxLauncher } from './xbox'
import { autoDetect, identifyLauncher, launchGame } from './index'
import type { GameDef } from './types'

afterEach(() => vi.clearAllMocks())

const GAME: GameDef = {
    id: 'pd3',
    name: 'PAYDAY 3',
    executable: 'PAYDAY3.exe',
    modsPath: 'PAYDAY3/Content/Paks/~mods',
    modExtensions: ['.pak'],
    launchers: {
        steam: { appId: 1272080, folderName: 'PAYDAY3' },
        epic: { displayName: 'PAYDAY 3', slug: 'payday-3' },
        xbox: { productId: '9NPZVDCH73SX' },
    },
}

describe('autoDetect', () => {
    it('returns Steam result when Steam has the game installed', () => {
        vi.mocked(SteamLauncher.isInstalled).mockReturnValue(true)
        vi.mocked(SteamLauncher.findGame).mockReturnValue('C:\\Steam\\steamapps\\common\\PAYDAY3')
        vi.mocked(EpicLauncher.isInstalled).mockReturnValue(false)
        vi.mocked(XboxLauncher.isInstalled).mockReturnValue(false)

        expect(autoDetect(GAME)).toEqual({
            launcher: 'steam',
            gamePath: 'C:\\Steam\\steamapps\\common\\PAYDAY3',
        })
    })

    it('skips launchers that are not installed', () => {
        vi.mocked(SteamLauncher.isInstalled).mockReturnValue(false)
        vi.mocked(EpicLauncher.isInstalled).mockReturnValue(true)
        vi.mocked(EpicLauncher.findGame).mockReturnValue('D:\\Epic Games\\PAYDAY 3')
        vi.mocked(XboxLauncher.isInstalled).mockReturnValue(false)

        expect(autoDetect(GAME)).toEqual({
            launcher: 'epic',
            gamePath: 'D:\\Epic Games\\PAYDAY 3',
        })
    })

    it('skips launchers where the game is not found', () => {
        vi.mocked(SteamLauncher.isInstalled).mockReturnValue(true)
        vi.mocked(SteamLauncher.findGame).mockReturnValue(null)
        vi.mocked(EpicLauncher.isInstalled).mockReturnValue(true)
        vi.mocked(EpicLauncher.findGame).mockReturnValue(null)
        vi.mocked(XboxLauncher.isInstalled).mockReturnValue(true)
        vi.mocked(XboxLauncher.findGame).mockReturnValue('C:\\XboxGames\\PAYDAY 3')

        expect(autoDetect(GAME)).toEqual({
            launcher: 'xbox',
            gamePath: 'C:\\XboxGames\\PAYDAY 3',
        })
    })

    it('returns null when no launcher finds the game', () => {
        vi.mocked(SteamLauncher.isInstalled).mockReturnValue(false)
        vi.mocked(EpicLauncher.isInstalled).mockReturnValue(false)
        vi.mocked(XboxLauncher.isInstalled).mockReturnValue(false)

        expect(autoDetect(GAME)).toBeNull()
    })
})

describe('identifyLauncher', () => {
    it('returns steam when SteamLauncher.identifyPath matches', () => {
        vi.mocked(SteamLauncher.identifyPath).mockReturnValue(true)
        expect(identifyLauncher('C:\\some\\path')).toBe('steam')
    })

    it('returns epic when only EpicLauncher.identifyPath matches', () => {
        vi.mocked(SteamLauncher.identifyPath).mockReturnValue(false)
        vi.mocked(EpicLauncher.identifyPath).mockReturnValue(true)
        expect(identifyLauncher('D:\\some\\path')).toBe('epic')
    })

    it('returns manual when no launcher identifies the path', () => {
        vi.mocked(SteamLauncher.identifyPath).mockReturnValue(false)
        vi.mocked(EpicLauncher.identifyPath).mockReturnValue(false)
        vi.mocked(XboxLauncher.identifyPath).mockReturnValue(false)
        expect(identifyLauncher('D:\\some\\path')).toBe('manual')
    })
})

describe('launchGame', () => {
    it('delegates to the matching launcher', () => {
        launchGame(GAME, 'steam', 'C:\\Steam\\steamapps\\common\\PAYDAY3', '-fileopenlog')
        expect(SteamLauncher.launch).toHaveBeenCalledWith(
            GAME,
            'C:\\Steam\\steamapps\\common\\PAYDAY3',
            '-fileopenlog'
        )
    })

    it('spawns the executable directly for manual launcher', () => {
        const mockChild = { unref: vi.fn() }
        vi.mocked(cp.spawn).mockReturnValue(mockChild as any)

        launchGame(GAME, 'manual', 'D:\\Games\\PAYDAY 3')

        expect(cp.spawn).toHaveBeenCalledWith('D:\\Games\\PAYDAY 3\\PAYDAY3.exe', [], {
            detached: true,
            stdio: 'ignore',
        })
        expect(mockChild.unref).toHaveBeenCalled()
    })
})
