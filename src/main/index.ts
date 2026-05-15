import { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog } from 'electron'
import { join } from 'path'
import { rmSync, renameSync, existsSync, writeFileSync } from 'fs'
import { execSync, spawn } from 'child_process'
import {
    listMods,
    getMod,
    getLatestFile,
    listModFiles,
    listCategories,
    registerDownload,
    type ListModsParams,
} from './api'
import { findGamePath, findSteamPath } from './steam'
import {
    installMod,
    uninstallMod,
    enableMod,
    disableMod,
    readState,
    reconcileState,
    findUntrackedPaks,
} from './mods'
import { downloadFile } from './download'
import { readSettings, writeSettings } from './settings'

function pakFilename(modName: string): string {
    return (
        modName
            .trim()
            .replace(/[^\w.-]+/g, '_')
            .replace(/^_+|_+$/g, '') + '.pak'
    )
}

function hashFilename(filename: string): number {
    let h = 0
    for (let i = 0; i < filename.length; i++) {
        h = (Math.imul(31, h) + filename.charCodeAt(i)) | 0
    }
    return -Math.abs(h) || -1
}

const statePath = join(app.getPath('userData'), 'installed.json')
const settingsPath = join(app.getPath('userData'), 'settings.json')
let resolvedGamePath: string | null = null

function registerHandlers(): void {
    ipcMain.handle('api:list-mods', (_, params: ListModsParams) => listMods(params))
    ipcMain.handle('api:list-categories', () => listCategories())
    ipcMain.handle('api:get-mod', (_, id: number) => getMod(id))
    ipcMain.handle('api:list-mod-files', (_, modId: number) => listModFiles(modId))

    ipcMain.handle('mods:find-game-path', () => resolvedGamePath)

    ipcMain.handle('settings:get', () => readSettings(settingsPath))
    ipcMain.handle('settings:set-game-path', (_, gamePath: string | null) => {
        const settings = readSettings(settingsPath)
        if (gamePath) {
            settings.gamePath = gamePath
        } else {
            delete settings.gamePath
        }
        writeSettings(settingsPath, settings)
        resolvedGamePath = gamePath ?? findGamePath()
    })
    ipcMain.handle('settings:pick-folder', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Select PAYDAY 3 installation folder',
            properties: ['openDirectory'],
            ...(resolvedGamePath ? { defaultPath: resolvedGamePath } : {}),
        })
        return result.canceled ? null : result.filePaths[0]
    })
    ipcMain.handle('mods:get-installed', async () => {
        const state = resolvedGamePath
            ? reconcileState(resolvedGamePath, statePath)
            : readState(statePath)
        if (!resolvedGamePath) return state

        const knownFilenames = new Set(state.mods.map((m) => m.filename))
        const untracked = findUntrackedPaks(resolvedGamePath, knownFilenames)
        if (untracked.length === 0) return state

        const results = await Promise.allSettled(
            untracked.map(async ({ filename, enabled }) => {
                const stem = filename.slice(0, -4)
                const numId = parseInt(stem, 10)
                if (!isNaN(numId) && String(numId) === stem) {
                    const mod = await getMod(numId)
                    return {
                        id: mod.id,
                        name: mod.name,
                        version: mod.version,
                        filename,
                        enabled,
                        installedAt: new Date().toISOString(),
                    }
                }
                return {
                    id: hashFilename(filename),
                    name: stem,
                    version: 'unknown',
                    filename,
                    enabled,
                    installedAt: new Date().toISOString(),
                }
            })
        )
        const newMods = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
        if (newMods.length === 0) return state

        const updated = { mods: [...state.mods, ...newMods] }
        writeFileSync(statePath, JSON.stringify(updated, null, 4))
        return updated
    })

    ipcMain.handle('mods:install', async (event, modId: number, gamePath: string) => {
        const mod = await getMod(modId)
        const file = mod.download ?? (mod.has_download ? await getLatestFile(modId) : null)
        if (!file) throw new Error('Mod has no download')
        const tmp = await downloadFile(file.download_url, file.type, (downloaded, total) =>
            event.sender.send('download:progress', { downloaded, total })
        )
        try {
            installMod(
                gamePath,
                statePath,
                {
                    id: mod.id,
                    name: mod.name,
                    version: mod.version,
                    filename:
                        readState(statePath).mods.find((m) => m.id === mod.id)?.filename ??
                        pakFilename(mod.name),
                    enabled: true,
                    installedAt: new Date().toISOString(),
                    fileId: file.id,
                },
                tmp
            )
            await registerDownload(file.id)
        } finally {
            rmSync(tmp, { force: true })
        }
    })

    ipcMain.handle(
        'mods:install-file',
        async (
            event,
            modId: number,
            modName: string,
            fileId: number,
            downloadUrl: string,
            fileType: string,
            modVersion: string,
            gamePath: string
        ) => {
            const tmp = await downloadFile(downloadUrl, fileType, (downloaded, total) =>
                event.sender.send('download:progress', { downloaded, total })
            )
            try {
                installMod(
                    gamePath,
                    statePath,
                    {
                        id: modId,
                        name: modName,
                        version: modVersion,
                        filename:
                            readState(statePath).mods.find((m) => m.id === modId)?.filename ??
                            pakFilename(modName),
                        enabled: true,
                        installedAt: new Date().toISOString(),
                        fileId,
                    },
                    tmp
                )
                await registerDownload(fileId)
            } finally {
                rmSync(tmp, { force: true })
            }
        }
    )

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

    function launchGame(launchOptions: string | undefined): void {
        const opts = launchOptions?.trim()
        const steamPath = findSteamPath()
        if (opts && steamPath) {
            const child = spawn(
                join(steamPath, 'steam.exe'),
                ['-applaunch', '1272080', ...opts.split(/\s+/)],
                {
                    detached: true,
                    stdio: 'ignore',
                }
            )
            child.unref()
        } else {
            shell.openExternal('steam://rungameid/1272080')
        }
    }

    ipcMain.handle('app:launch-modded', () => {
        const { launchOptions } = readSettings(settingsPath)
        launchGame(launchOptions)
    })

    ipcMain.handle('shell:open-external', (_, url: string) => shell.openExternal(url))

    ipcMain.handle('app:launch-without-mods', (_, gamePath: string) => {
        const modsDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
        const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
        if (existsSync(modsDir)) renameSync(modsDir, modsBak)
        const { launchOptions } = readSettings(settingsPath)
        launchGame(launchOptions)
    })

    ipcMain.handle('app:restore-mods', () => {
        if (!resolvedGamePath) return
        const modsDir = join(resolvedGamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
        const modsBak = join(resolvedGamePath, 'PAYDAY3', 'Content', '~mods.bak')
        if (!existsSync(modsDir) && existsSync(modsBak)) renameSync(modsBak, modsDir)
    })

    ipcMain.handle('settings:set-launch-options', (_, launchOptions: string) => {
        const settings = readSettings(settingsPath)
        settings.launchOptions = launchOptions || undefined
        writeSettings(settingsPath, settings)
    })
    ipcMain.handle('settings:set-skip-fileopenlog-warning', (_, skip: boolean) => {
        const settings = readSettings(settingsPath)
        settings.skipFileOpenLogWarning = skip || undefined
        writeSettings(settingsPath, settings)
    })
    ipcMain.handle('settings:dismiss-deps-warning', (_, modId: number) => {
        const settings = readSettings(settingsPath)
        const existing = settings.dismissedDepsWarnings ?? []
        if (!existing.includes(modId)) {
            settings.dismissedDepsWarnings = [...existing, modId]
            writeSettings(settingsPath, settings)
        }
    })
}

function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: join(__dirname, '../../assets/icon.ico'),
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

app.whenReady().then(() => {
    resolvedGamePath = readSettings(settingsPath).gamePath ?? findGamePath()
    if (resolvedGamePath) {
        const modsDir = join(resolvedGamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
        const modsBak = join(resolvedGamePath, 'PAYDAY3', 'Content', '~mods.bak')
        if (!existsSync(modsDir) && existsSync(modsBak)) renameSync(modsBak, modsDir)
    }

    registerHandlers()
    const win = createWindow()
    if (!app.isPackaged) {
        globalShortcut.register('CommandOrControl+Shift+I', () => win.webContents.toggleDevTools())
    }
})
