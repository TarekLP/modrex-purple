import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { ListModsParams } from '../main/api'

contextBridge.exposeInMainWorld('api', {
    listMods: (params?: ListModsParams) => ipcRenderer.invoke('api:list-mods', params),
    listCategories: () => ipcRenderer.invoke('api:list-categories'),
    getMod: (id: number) => ipcRenderer.invoke('api:get-mod', id),
    listModFiles: (modId: number) => ipcRenderer.invoke('api:list-mod-files', modId),

    findGamePath: () => ipcRenderer.invoke('mods:find-game-path'),
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
    uninstallMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:uninstall', modId, gamePath),
    enableMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:enable', modId, gamePath),
    disableMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:disable', modId, gamePath),
    reorderMods: (orderedIds: number[], gamePath: string) =>
        ipcRenderer.invoke('mods:reorder', orderedIds, gamePath),

    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),

    getSettings: () => ipcRenderer.invoke('settings:get'),
    setGamePath: (gamePath: string | null) =>
        ipcRenderer.invoke('settings:set-game-path', gamePath),
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
})
