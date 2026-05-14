import { contextBridge, ipcRenderer } from 'electron'
import type { ListModsParams } from '../main/api'

contextBridge.exposeInMainWorld('api', {
    listMods: (params?: ListModsParams) => ipcRenderer.invoke('api:list-mods', params),
    listCategories: () => ipcRenderer.invoke('api:list-categories'),
    getMod: (id: number) => ipcRenderer.invoke('api:get-mod', id),

    findGamePath: () => ipcRenderer.invoke('mods:find-game-path'),
    getInstalled: () => ipcRenderer.invoke('mods:get-installed'),
    installMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:install', modId, gamePath),
    uninstallMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:uninstall', modId, gamePath),
    enableMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:enable', modId, gamePath),
    disableMod: (modId: number, gamePath: string) =>
        ipcRenderer.invoke('mods:disable', modId, gamePath),

    launchModded: () => ipcRenderer.invoke('app:launch-modded'),
    launchWithoutMods: (gamePath: string) =>
        ipcRenderer.invoke('app:launch-without-mods', gamePath),
})
