import type { Mod, Category, Paginated, ModsState } from './types'
import type { ListModsParams } from '../main/api'

declare global {
    interface Window {
        api: {
            listMods(params?: ListModsParams): Promise<Paginated<Mod>>
            listCategories(): Promise<Paginated<Category>>
            getMod(id: number): Promise<Mod>

            findGamePath(): Promise<string | null>
            getInstalled(): Promise<ModsState>
            installMod(modId: number, gamePath: string): Promise<void>
            uninstallMod(modId: number, gamePath: string): Promise<void>
            enableMod(modId: number, gamePath: string): Promise<void>
            disableMod(modId: number, gamePath: string): Promise<void>
        }
    }
}
