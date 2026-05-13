import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { rmSync } from 'fs'
import { listMods, getMod, listCategories, registerDownload, type ListModsParams } from './api'
import { findGamePath } from './steam'
import { installMod, uninstallMod, enableMod, disableMod, readState } from './mods'
import { downloadFile } from './download'

const statePath = join(app.getPath('userData'), 'installed.json')

function registerHandlers(): void {
    ipcMain.handle('api:list-mods', (_, params: ListModsParams) => listMods(params))
    ipcMain.handle('api:list-categories', () => listCategories())
    ipcMain.handle('api:get-mod', (_, id: number) => getMod(id))

    ipcMain.handle('mods:find-game-path', () => findGamePath())
    ipcMain.handle('mods:get-installed', () => readState(statePath))

    ipcMain.handle('mods:install', async (_, modId: number, gamePath: string) => {
        const mod = await getMod(modId)
        if (!mod.download) throw new Error('Mod has no download')
        const tmp = await downloadFile(mod.download.download_url, mod.download.type)
        try {
            installMod(
                gamePath,
                statePath,
                {
                    id: mod.id,
                    name: mod.name,
                    version: mod.version,
                    filename: `${mod.id}.pak`,
                    enabled: true,
                    installedAt: new Date().toISOString(),
                },
                tmp
            )
            await registerDownload(mod.download.id)
        } finally {
            rmSync(tmp, { force: true })
        }
    })

    ipcMain.handle('mods:uninstall', (_, modId: number, gamePath: string) =>
        uninstallMod(gamePath, statePath, modId)
    )
    ipcMain.handle('mods:enable', (_, modId: number, gamePath: string) =>
        enableMod(gamePath, statePath, modId)
    )
    ipcMain.handle('mods:disable', (_, modId: number, gamePath: string) =>
        disableMod(gamePath, statePath, modId)
    )
}

function createWindow(): void {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
        },
    })

    win.setMenu(null)

    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        win.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

app.whenReady().then(() => {
    registerHandlers()
    createWindow()
})
