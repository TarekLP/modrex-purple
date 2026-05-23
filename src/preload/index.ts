import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { ListModsParams } from '../main/api'
import type { TopLevelItem } from '../shared/types'

contextBridge.exposeInMainWorld('api', {
    listMods: (params?: ListModsParams) => ipcRenderer.invoke('api:list-mods', params),
    listCategories: () => ipcRenderer.invoke('api:list-categories'),
    getMod: (id: number) => ipcRenderer.invoke('api:get-mod', id),
    listModFiles: (modId: number) => ipcRenderer.invoke('api:list-mod-files', modId),

    findGamePath: () => ipcRenderer.invoke('mods:find-game-path'),
    openModsFolder: () => ipcRenderer.invoke('mods:open-folder'),
    getInstalled: () => ipcRenderer.invoke('mods:get-installed'),
    installMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:install', modId, gamePath),
    installModFile: (
        modId: number,
        modName: string,
        fileId: number,
        downloadUrl: string,
        fileType: string,
        modVersion: string,
        gamePath: string
    ) =>
        ipcRenderer.invoke(
            'mods:install-file',
            modId,
            modName,
            fileId,
            downloadUrl,
            fileType,
            modVersion,
            gamePath
        ),
    uninstallMod: (uid: string, gamePath: string) =>
        ipcRenderer.invoke('mods:uninstall', uid, gamePath),
    enableMod: (uid: string, gamePath: string) => ipcRenderer.invoke('mods:enable', uid, gamePath),
    disableMod: (uid: string, gamePath: string) =>
        ipcRenderer.invoke('mods:disable', uid, gamePath),
    reorderModsInFolder: (folderId: string | null, orderedUids: string[], gamePath: string) =>
        ipcRenderer.invoke('mods:reorder-in-folder', folderId, orderedUids, gamePath),
    moveModToFolder: (
        uid: string,
        targetFolderId: string | null,
        targetPosition: number,
        gamePath: string
    ) => ipcRenderer.invoke('mods:move-to-folder', uid, targetFolderId, targetPosition, gamePath),
    reorderChildren: (parentId: string | null, items: TopLevelItem[], gamePath: string) =>
        ipcRenderer.invoke('folders:reorder-children', parentId, items, gamePath),
    moveFolder: (folderId: string, targetParentId: string | null, gamePath: string) =>
        ipcRenderer.invoke('folders:move', folderId, targetParentId, gamePath),
    createFolder: (displayName: string, parentId: string | null, gamePath: string) =>
        ipcRenderer.invoke('folders:create', displayName, parentId, gamePath),
    renameFolder: (folderId: string, displayName: string, gamePath: string) =>
        ipcRenderer.invoke('folders:rename', folderId, displayName, gamePath),
    deleteFolder: (folderId: string, gamePath: string) =>
        ipcRenderer.invoke('folders:delete', folderId, gamePath),

    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
    openLog: () => ipcRenderer.invoke('app:open-log'),

    getSettings: () => ipcRenderer.invoke('settings:get'),
    setGamePath: (gamePath: string | null) =>
        ipcRenderer.invoke('settings:set-game-path', gamePath),
    setLauncher: (launcher: string) => ipcRenderer.invoke('settings:set-launcher', launcher),
    setLaunchOptions: (launchOptions: string) =>
        ipcRenderer.invoke('settings:set-launch-options', launchOptions),
    setSkipFileOpenLogWarning: (skip: boolean) =>
        ipcRenderer.invoke('settings:set-skip-fileopenlog-warning', skip),
    dismissDepsWarning: (modId: number) =>
        ipcRenderer.invoke('settings:dismiss-deps-warning', modId),
    pickFolder: () => ipcRenderer.invoke('settings:pick-folder'),

    onDownloadProgress: (callback: (info: { downloaded: number; total: number }) => void) => {
        const handler = (_: IpcRendererEvent, info: { downloaded: number; total: number }) =>
            callback(info)
        ipcRenderer.on('download:progress', handler)
        return () => ipcRenderer.removeListener('download:progress', handler)
    },

    isGameRunning: () => ipcRenderer.invoke('app:is-game-running'),
    stopGame: () => ipcRenderer.invoke('app:stop-game'),
    launchModded: () => ipcRenderer.invoke('app:launch-modded'),
    launchWithoutMods: (gamePath: string) =>
        ipcRenderer.invoke('app:launch-without-mods', gamePath),
    restoreMods: () => ipcRenderer.invoke('app:restore-mods'),

    onUpdateAvailable: (
        callback: (info: {
            version: string
            strategy: 'auto' | 'manual' | 'browser'
            body: string
            releaseUrl: string
        }) => void
    ) => {
        const handler = (
            _: IpcRendererEvent,
            info: {
                version: string
                strategy: 'auto' | 'manual' | 'browser'
                body: string
                releaseUrl: string
            }
        ) => callback(info)
        ipcRenderer.on('updater:update-available', handler)
        return () => ipcRenderer.removeListener('updater:update-available', handler)
    },
    onUpdateProgress: (callback: (percent: number) => void) => {
        const handler = (_: IpcRendererEvent, percent: number) => callback(percent)
        ipcRenderer.on('updater:download-progress', handler)
        return () => ipcRenderer.removeListener('updater:download-progress', handler)
    },
    onUpdateReady: (callback: () => void) => {
        ipcRenderer.on('updater:update-ready', callback)
        return () => ipcRenderer.removeListener('updater:update-ready', callback)
    },
    download: (version: string) => ipcRenderer.invoke('updater:download', version),
    installUpdate: () => ipcRenderer.invoke('updater:install'),
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
})
