import type { Mod, ModFile, Category, Paginated, InstalledMod } from './types'
import type { ListModsParams } from '../main/api'

declare global {
    interface Window {
        api: {
            listMods(params?: ListModsParams): Promise<Paginated<Mod>>
            listCategories(): Promise<Paginated<Category>>
            getMod(id: number): Promise<Mod>
            listModFiles(modId: number): Promise<Paginated<ModFile>>

            findGamePath(): Promise<string | null>
            getInstalled(): Promise<{ mods: InstalledMod[]; modsHidden: boolean }>
            installMod(modId: number, gamePath: string): Promise<void>
            installModFile(
                modId: number,
                modName: string,
                fileId: number,
                downloadUrl: string,
                fileType: string,
                modVersion: string,
                gamePath: string
            ): Promise<void>
            uninstallMod(modId: number, gamePath: string): Promise<void>
            enableMod(modId: number, gamePath: string): Promise<void>
            disableMod(modId: number, gamePath: string): Promise<void>
            reorderMods(orderedIds: number[], gamePath: string): Promise<void>

            openExternal(url: string): Promise<void>
            openPath(path: string): Promise<void>
            openLog(): Promise<void>
            getSettings(): Promise<{
                gamePath?: string
                launchOptions?: string
                skipFileOpenLogWarning?: boolean
                dismissedDepsWarnings?: number[]
            }>
            setGamePath(gamePath: string | null): Promise<void>
            setLaunchOptions(launchOptions: string): Promise<void>
            setSkipFileOpenLogWarning(skip: boolean): Promise<void>
            dismissDepsWarning(modId: number): Promise<void>
            pickFolder(): Promise<string | null>
            onDownloadProgress(
                callback: (info: { downloaded: number; total: number }) => void
            ): () => void

            isGameRunning(): Promise<boolean>
            stopGame(): Promise<void>
            launchModded(): Promise<void>
            launchWithoutMods(gamePath: string): Promise<void>
            restoreMods(): Promise<void>

            onUpdateAvailable(
                callback: (info: {
                    version: string
                    strategy: 'auto' | 'manual' | 'browser'
                    body: string
                    releaseUrl: string
                }) => void
            ): () => void
            onUpdateProgress(callback: (percent: number) => void): () => void
            onUpdateReady(callback: () => void): () => void
            download(version: string): Promise<void>
            installUpdate(): Promise<void>
            checkForUpdates(): Promise<void>
        }
    }
}
