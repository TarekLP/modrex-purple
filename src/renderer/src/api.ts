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
} from '../../shared/types'

type Settings = {
    gamePath?: string
    launcher?: string
    launchOptions?: string
    skipFileOpenLogWarning?: boolean
    dismissedDepsWarnings?: number[]
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
    listMods(params?: ListModsParams): Promise<Paginated<Mod>> {
        return invoke('list_mods', { params: params ?? {} })
    },
    listCategories(): Promise<Paginated<Category>> {
        return invoke('list_categories')
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
    async findGamePath(): Promise<string | null> {
        const s = await invoke<Settings>('get_settings')
        if (s.gamePath) return s.gamePath
        await invoke('configure_game_path', { gamePath: null })
        const s2 = await invoke<Settings>('get_settings')
        return s2.gamePath ?? null
    },
    setGamePath(gamePath: string | null): Promise<void> {
        return invoke('configure_game_path', { gamePath })
    },
    setLauncher(launcher: string): Promise<void> {
        return invoke('set_launcher', { launcher })
    },
    setLaunchOptions(launchOptions: string): Promise<void> {
        return invoke('set_launch_options', { launchOptions })
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

    // ── Installed mods ─────────────────────────────────────────────────────────
    getInstalled(): Promise<{ mods: InstalledMod[]; folders: ModFolder[]; modsHidden: boolean }> {
        return invoke('get_installed')
    },
    openModsFolder(): Promise<void> {
        return invoke('open_mods_folder')
    },
    installMod(modId: number, gamePath: string): Promise<void> {
        return invoke('install_mod', { modId, gamePath })
    },
    installModFile(
        modId: number,
        modName: string,
        fileId: number,
        downloadUrl: string,
        fileType: string,
        modVersion: string,
        gamePath: string
    ): Promise<void> {
        return invoke('install_file', {
            modId,
            modName,
            fileId,
            downloadUrl,
            fileType,
            modVersion,
            gamePath,
        })
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
        folderId?: string | null
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
        })
    },
    uninstallMod(uid: string, gamePath: string): Promise<void> {
        return invoke('uninstall_mod', { uid, gamePath })
    },
    enableMod(uid: string, gamePath: string): Promise<void> {
        return invoke('enable_mod', { uid, gamePath })
    },
    disableMod(uid: string, gamePath: string): Promise<void> {
        return invoke('disable_mod', { uid, gamePath })
    },
    reorderModsInFolder(
        folderId: string | null,
        orderedUids: string[],
        gamePath: string
    ): Promise<void> {
        return invoke('reorder_in_folder', { folderId, orderedUids, gamePath })
    },
    moveModToFolder(
        uid: string,
        targetFolderId: string | null,
        targetPosition: number,
        gamePath: string
    ): Promise<void> {
        return invoke('move_to_folder', { uid, targetFolderId, targetPosition, gamePath })
    },
    reorderChildren(
        parentId: string | null,
        items: TopLevelItem[],
        gamePath: string
    ): Promise<void> {
        return invoke('reorder_children', { parentId, items, gamePath })
    },
    moveFolder(folderId: string, targetParentId: string | null, gamePath: string): Promise<void> {
        return invoke('move_folder', { folderId, targetParentId, gamePath })
    },
    createFolder(
        displayName: string,
        parentId: string | null,
        gamePath: string
    ): Promise<ModFolder> {
        return invoke('create_folder', { displayName, parentId, gamePath })
    },
    renameFolder(folderId: string, displayName: string, gamePath: string): Promise<void> {
        return invoke('rename_folder', { folderId, displayName, gamePath })
    },
    deleteFolder(folderId: string, gamePath: string): Promise<void> {
        return invoke('delete_folder', { folderId, gamePath })
    },

    // ── Launchers & system ─────────────────────────────────────────────────────
    isGameRunning(): Promise<boolean> {
        return invoke('is_game_running')
    },
    stopGame(): Promise<void> {
        return invoke('stop_game')
    },
    launchModded(): Promise<void> {
        return invoke('launch_game')
    },
    launchWithoutMods(): Promise<void> {
        return invoke('launch_without_mods')
    },
    restoreMods(): Promise<void> {
        return invoke('restore_mods')
    },
    getInstalledLaunchers(): Promise<string[]> {
        return invoke('installed_launchers')
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
