import type { GameDef } from '../types'

export const PD3: GameDef = {
    id: 'pd3',
    name: 'PAYDAY 3',
    executable: 'PAYDAY3.exe',
    modsPath: 'PAYDAY3/Content/Paks/~mods',
    modExtensions: ['.pak'],
    launchers: {
        steam: {
            appId: 1272080,
            folderName: 'PAYDAY3',
        },
        epic: {
            displayName: 'PAYDAY 3',
            slug: 'payday-3',
        },
        xbox: {
            productId: '9NPZVDCH73SX',
            executable: 'PAYDAY3/Binaries/WinGDK/PAYDAY3-WinGDK-Shipping.exe',
        },
    },
}
