import { app, BrowserWindow, ipcMain, globalShortcut, shell } from 'electron'
import { join } from 'path'
import { rmSync, renameSync, existsSync, readdirSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { listMods, getMod, listCategories, registerDownload, type ListModsParams } from './api'
import { findGamePath } from './steam'
import { installMod, uninstallMod, enableMod, disableMod, readState, reconcileState } from './mods'
import { downloadFile } from './download'

const statePath = join(app.getPath('userData'), 'installed.json')
let resolvedGamePath: string | null = null

function registerHandlers(): void {
    ipcMain.handle('api:list-mods', (_, params: ListModsParams) => listMods(params))
    ipcMain.handle('api:list-categories', () => listCategories())
    ipcMain.handle('api:get-mod', (_, id: number) => getMod(id))

    ipcMain.handle('mods:find-game-path', () => findGamePath())
    ipcMain.handle('mods:get-installed', () =>
        resolvedGamePath ? reconcileState(resolvedGamePath, statePath) : readState(statePath)
    )

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

    ipcMain.handle('app:is-game-running', () => {
        try {
            const out = execSync('tasklist /FI "IMAGENAME eq PAYDAY3-Win64-Shipping.exe" /NH', {
                encoding: 'utf8',
            })
            return out.includes('PAYDAY3-Win64-Shipping')
        } catch {
            return false
        }
    })

    ipcMain.handle('app:stop-game', () => {
        try {
            execSync('taskkill /F /IM PAYDAY3-Win64-Shipping.exe')
        } catch {}
    })

    ipcMain.handle('app:launch-modded', async () => {
        await shell.openExternal('steam://rungameid/1272080')
    })

    ipcMain.handle('app:launch-without-mods', async (_, gamePath: string) => {
        const modsDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
        const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
        if (existsSync(modsDir)) renameSync(modsDir, modsBak)
        await shell.openExternal('steam://rungameid/1272080')
    })
}

function createWindow(): BrowserWindow {
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

    return win
}

async function recoverStateIfNeeded(gamePath: string): Promise<void> {
    if (readState(statePath).mods.length > 0) return

    const activeDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
    const disabledDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', 'disabled')

    const orphaned: { id: number; enabled: boolean }[] = []
    if (existsSync(activeDir)) {
        for (const file of readdirSync(activeDir)) {
            if (file.endsWith('.pak')) {
                const id = parseInt(file.slice(0, -4), 10)
                if (!isNaN(id)) orphaned.push({ id, enabled: true })
            }
        }
    }
    if (existsSync(disabledDir)) {
        for (const file of readdirSync(disabledDir)) {
            if (file.endsWith('.pak')) {
                const id = parseInt(file.slice(0, -4), 10)
                if (!isNaN(id)) orphaned.push({ id, enabled: false })
            }
        }
    }
    if (orphaned.length === 0) return

    const results = await Promise.allSettled(
        orphaned.map(({ id, enabled }) =>
            getMod(id).then((mod) => ({
                id: mod.id,
                name: mod.name,
                version: mod.version,
                filename: `${mod.id}.pak`,
                enabled,
                installedAt: new Date().toISOString(),
            }))
        )
    )
    const recovered = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    if (recovered.length > 0) writeFileSync(statePath, JSON.stringify({ mods: recovered }, null, 4))
}

app.whenReady().then(async () => {
    resolvedGamePath = findGamePath()
    if (resolvedGamePath) {
        const modsDir = join(resolvedGamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
        const modsBak = join(resolvedGamePath, 'PAYDAY3', 'Content', '~mods.bak')
        if (!existsSync(modsDir) && existsSync(modsBak)) renameSync(modsBak, modsDir)
        await recoverStateIfNeeded(resolvedGamePath)
    }

    registerHandlers()
    const win = createWindow()
    if (!app.isPackaged) {
        globalShortcut.register('CommandOrControl+Shift+I', () => win.webContents.toggleDevTools())
    }
})
