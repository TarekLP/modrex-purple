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
        fileVersion: string,
        gamePath: string
    ) =>
        ipcRenderer.invoke(
            'mods:install-file',
            modId,
            modName,
            fileId,
            downloadUrl,
            fileType,
            fileVersion,
            gamePath
        ),
    uninstallMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:uninstall', modId, gamePath),
    enableMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:enable', modId, gamePath),
    disableMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:disable', modId, gamePath),

    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

    getSettings: () => ipcRenderer.invoke('settings:get'),
    setGamePath: (gamePath: string | null) =>
        ipcRenderer.invoke('settings:set-game-path', gamePath),
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
})
