import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
    Mod,
    ModFile,
    ModLink,
    Category,
    Paginated,
    InstalledMod,
    ModFolder,
    TopLevelItem,
    ListModsParams,
    IndexModFile,
} from '../../shared/types'

type Settings = {
    gamePath?: string
    launcher?: string
    launchOptions?: string
    skipFileOpenLogWarning?: boolean
    dismissedDepsWarnings?: number[]
}

export type GameSettings = {
    gamePath?: string
    launcher?: string
    launchOptions?: string
}

function onEvent<T>(eventName: string, callback: (payload: T) => void): () => void {
    let unlistenFn: (() => void) | null = null
    let cancelled = false
    listen<T>(eventName, (event) => callback(event.payload)).then((fn) => {
        if (cancelled) fn()
        else unlistenFn = fn
    })
    return () => {
        cancelled = true
        unlistenFn?.()
    }
}

export const api = {
    // ── Browse / API ───────────────────────────────────────────────────────────
    listMods(gameId: number, params?: ListModsParams): Promise<Paginated<Mod>> {
        return invoke('list_mods', { gameId, params: params ?? {} })
    },
    listCategories(gameId: number): Promise<Paginated<Category>> {
        return invoke('list_categories', { gameId })
    },
    getMod(id: number): Promise<Mod> {
        return invoke('get_mod', { id })
    },
    listModFiles(modId: number): Promise<Paginated<ModFile>> {
        return invoke('list_mod_files', { modId })
    },
    listModLinks(modId: number): Promise<Paginated<ModLink>> {
        return invoke('list_mod_links', { modId })
    },

    // ── Settings ───────────────────────────────────────────────────────────────
    getSettings(): Promise<Settings> {
        return invoke('get_settings')
    },
    getGameSettings(gameId: string): Promise<GameSettings> {
        return invoke('get_game_settings', { gameId })
    },
    async findGamePath(gameId = 'pd3'): Promise<string | null> {
        await invoke('configure_game_path', { gamePath: null, gameId })
        const gs = await invoke<GameSettings>('get_game_settings', { gameId })
        return gs.gamePath ?? null
    },
    setGamePath(gamePath: string | null, gameId?: string): Promise<void> {
        return invoke('configure_game_path', { gamePath, ...(gameId ? { gameId } : {}) })
    },
    setLauncher(launcher: string, gameId?: string): Promise<void> {
        return invoke('set_launcher', { launcher, ...(gameId ? { gameId } : {}) })
    },
    setLaunchOptions(launchOptions: string, gameId?: string): Promise<void> {
        return invoke('set_launch_options', { launchOptions, ...(gameId ? { gameId } : {}) })
    },
    setSkipFileOpenLogWarning(skip: boolean): Promise<void> {
        return invoke('set_skip_fileopenlog_warning', { skip })
    },
    dismissDepsWarning(modId: number): Promise<void> {
        return invoke('dismiss_deps_warning', { modId })
    },
    pickFolder(defaultPath?: string): Promise<string | null> {
        return invoke('pick_folder', { defaultPath: defaultPath ?? null })
    },
    openLog(): Promise<void> {
        return invoke('open_log_file')
    },

    // ── Analytics ────────────────────────────────────────────────────────────────
    // Fire-and-forget: the Rust side gates on consent and swallows errors, so callers
    // never need to await or catch.
    trackEvent(name: string, params?: Record<string, string | number | boolean>): Promise<void> {
        return invoke('track_event', { name, params: params ?? {} })
    },
    // null = the user hasn't been asked yet (show the first-run consent dialog).
    getAnalyticsConsent(): Promise<boolean | null> {
        return invoke('get_analytics_consent')
    },
    setAnalyticsConsent(enabled: boolean): Promise<void> {
        return invoke('set_analytics_consent', { enabled })
    },

    // ── Installed mods ─────────────────────────────────────────────────────────
    getInstalled(
        gameId = 'pd3'
    ): Promise<{ mods: InstalledMod[]; folders: ModFolder[]; modsHidden: boolean }> {
        return invoke('get_installed', { gameId })
    },
    openModsFolder(gameId?: string): Promise<void> {
        return gameId ? invoke('open_mods_folder', { gameId }) : invoke('open_mods_folder')
    },
    installMod(modId: number, gamePath: string, gameId?: string): Promise<void> {
        return invoke('install_mod', { modId, gamePath, gameId })
    },
    installModFile(
        modId: number,
        modName: string,
        fileId: number,
        downloadUrl: string,
        fileType: string,
        modVersion: string,
        gamePath: string,
        gameId?: string
    ): Promise<void> {
        return invoke('install_file', {
            modId,
            modName,
            fileId,
            downloadUrl,
            fileType,
            modVersion,
            gamePath,
            gameId,
        })
    },
    deleteTempFile(path: string): Promise<void> {
        return invoke('delete_temp_file', { path })
    },
    getIndexModFiles(modId: number, gameId?: string): Promise<IndexModFile[]> {
        return invoke('get_index_mod_files', { modId, gameId })
    },
    installFromZipEntry(
        zipPath: string,
        entryName: string,
        modId: number,
        modName: string,
        fileId: number,
        fileType: string,
        modVersion: string,
        gamePath: string,
        folderId?: string | null,
        gameId?: string,
        locationTag?: string
    ): Promise<void> {
        return invoke('install_from_zip_entry', {
            zipPath,
            entryName,
            modId,
            modName,
            fileId,
            fileType,
            modVersion,
            gamePath,
            folderId,
            gameId,
            locationTag,
        })
    },
    uninstallMod(uid: string, gamePath: string, gameId?: string): Promise<void> {
        return invoke('uninstall_mod', { uid, gamePath, gameId })
    },
    enableMod(uid: string, gamePath: string, gameId?: string): Promise<void> {
        return invoke('enable_mod', { uid, gamePath, gameId })
    },
    disableMod(uid: string, gamePath: string, gameId?: string): Promise<void> {
        return invoke('disable_mod', { uid, gamePath, gameId })
    },
    reorderModsInFolder(
        folderId: string | null,
        orderedUids: string[],
        gamePath: string,
        gameId?: string
    ): Promise<void> {
        return invoke('reorder_in_folder', { folderId, orderedUids, gamePath, gameId })
    },
    moveModToFolder(
        uid: string,
        targetFolderId: string | null,
        targetPosition: number,
        gamePath: string,
        gameId?: string
    ): Promise<void> {
        return invoke('move_to_folder', { uid, targetFolderId, targetPosition, gamePath, gameId })
    },
    reorderChildren(
        parentId: string | null,
        items: TopLevelItem[],
        gamePath: string,
        gameId?: string
    ): Promise<void> {
        return invoke('reorder_children', { parentId, items, gamePath, gameId })
    },
    moveFolder(
        folderId: string,
        targetParentId: string | null,
        gamePath: string,
        gameId?: string
    ): Promise<void> {
        return invoke('move_folder', { folderId, targetParentId, gamePath, gameId })
    },
    createFolder(
        displayName: string,
        parentId: string | null,
        gamePath: string,
        gameId?: string
    ): Promise<ModFolder> {
        return invoke('create_folder', { displayName, parentId, gamePath, gameId })
    },
    renameFolder(
        folderId: string,
        displayName: string,
        gamePath: string,
        gameId?: string
    ): Promise<void> {
        return invoke('rename_folder', { folderId, displayName, gamePath, gameId })
    },
    deleteFolder(folderId: string, gamePath: string, gameId?: string): Promise<void> {
        return invoke('delete_folder', { folderId, gamePath, gameId })
    },

    // ── SuperBLT ───────────────────────────────────────────────────────────────
    checkSuperblt(gamePath: string): Promise<boolean> {
        return invoke('check_superblt', { gamePath })
    },
    installSuperblt(gamePath: string): Promise<void> {
        return invoke('install_superblt', { gamePath })
    },

    // ── Launchers & system ─────────────────────────────────────────────────────
    isGameRunning(gameId?: string): Promise<boolean> {
        return gameId ? invoke('is_game_running', { gameId }) : invoke('is_game_running')
    },
    stopGame(gameId?: string): Promise<void> {
        return gameId ? invoke('stop_game', { gameId }) : invoke('stop_game')
    },
    launchModded(gameId?: string): Promise<void> {
        return gameId ? invoke('launch_game', { gameId }) : invoke('launch_game')
    },
    launchWithoutMods(gameId?: string): Promise<void> {
        return gameId ? invoke('launch_without_mods', { gameId }) : invoke('launch_without_mods')
    },
    restoreMods(gameId?: string): Promise<void> {
        return gameId ? invoke('restore_mods', { gameId }) : invoke('restore_mods')
    },
    getInstalledLaunchers(gameId?: string): Promise<string[]> {
        return gameId ? invoke('installed_launchers', { gameId }) : invoke('installed_launchers')
    },
    openExternal(url: string): Promise<void> {
        return invoke('shell_open_external', { url })
    },
    openPath(path: string): Promise<void> {
        return invoke('shell_open_path', { path })
    },

    // ── Events ─────────────────────────────────────────────────────────────────
    onDownloadProgress(
        callback: (info: { downloaded: number; total: number }) => void
    ): () => void {
        return onEvent<{ downloaded: number; total: number }>('download:progress', callback)
    },
    onUpdateAvailable(
        callback: (info: {
            version: string
            strategy: 'auto' | 'manual' | 'browser'
            body: string
            releaseUrl: string
        }) => void
    ): () => void {
        return onEvent('updater:update-available', callback)
    },
    onUpdateProgress(callback: (percent: number) => void): () => void {
        return onEvent<number>('updater:update-progress', callback)
    },
    onUpdateReady(callback: () => void): () => void {
        return onEvent<void>('updater:update-ready', () => callback())
    },

    // ── Thumbnails ─────────────────────────────────────────────────────────────
    getThumbnail(filename: string, full?: boolean): Promise<string> {
        return invoke('get_thumbnail', { filename, full })
    },

    // ── Updater ────────────────────────────────────────────────────────────────
    download(): Promise<void> {
        return invoke('download_update')
    },
    installUpdate(): Promise<void> {
        return invoke('install_update')
    },
    checkForUpdates(): Promise<void> {
        return invoke('check_for_update')
    },
}
