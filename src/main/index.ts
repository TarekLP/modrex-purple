import { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
import { join } from 'path'
import { rmSync, renameSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { exec, execSync, spawn } from 'child_process'
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
    reorderMods,
    uninstallMod,
    enableMod,
    disableMod,
    readState,
    reconcileState,
    findUntrackedPaks,
    stripPriorityPrefix,
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

const legacyStatePath = join(app.getPath('userData'), 'installed.json')
const settingsPath = join(app.getPath('userData'), 'settings.json')

function getStatePath(gamePath: string | null): string {
    if (!gamePath) return legacyStatePath
    return join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods', '.pd3mm.json')
}
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
        const statePath = getStatePath(resolvedGamePath)
        const state = resolvedGamePath
            ? await reconcileState(resolvedGamePath, statePath)
            : readState(statePath)

        const modsHidden =
            !!resolvedGamePath &&
            existsSync(join(resolvedGamePath, 'PAYDAY3', 'Content', '~mods.bak'))

        if (!resolvedGamePath) return { mods: state.mods, modsHidden }

        const knownFilenames = new Set(state.mods.map((m) => m.filename))
        const untracked = await findUntrackedPaks(resolvedGamePath, knownFilenames)
        if (untracked.length === 0) return { mods: state.mods, modsHidden }

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
                    name: stripPriorityPrefix(stem),
                    version: 'unknown',
                    filename,
                    enabled,
                    installedAt: new Date().toISOString(),
                }
            })
        )
        const newMods = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
        if (newMods.length === 0) return { mods: state.mods, modsHidden }

        const updated = { mods: [...state.mods, ...newMods] }
        writeFileSync(statePath, JSON.stringify(updated, null, 4))
        return { mods: updated.mods, modsHidden }
    })

    ipcMain.handle('mods:install', async (event, modId: number, gamePath: string) => {
        const statePath = getStatePath(gamePath)
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
            const statePath = getStatePath(gamePath)
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
        uninstallMod(gamePath, getStatePath(gamePath), modId)
    )
    ipcMain.handle('mods:enable', (_, modId: number, gamePath: string) =>
        enableMod(gamePath, getStatePath(gamePath), modId)
    )
    ipcMain.handle('mods:disable', (_, modId: number, gamePath: string) =>
        disableMod(gamePath, getStatePath(gamePath), modId)
    )
    ipcMain.handle('mods:reorder', (_, orderedIds: number[], gamePath: string) =>
        reorderMods(gamePath, getStatePath(gamePath), orderedIds)
    )

    ipcMain.handle('app:is-game-running', () => {
        return new Promise<boolean>((resolve) => {
            if (process.platform === 'linux') {
                exec('pgrep -f "PAYDAY3-Win64-Shipping"', (error, stdout) =>
                    resolve(!error && stdout.trim().length > 0)
                )
            } else {
                exec(
                    'tasklist /FI "IMAGENAME eq PAYDAY3-Win64-Shipping.exe" /NH',
                    { encoding: 'utf8' },
                    (error, stdout) => resolve(!error && stdout.includes('PAYDAY3-Win64-Shipping'))
                )
            }
        })
    })

    ipcMain.handle('app:stop-game', () => {
        try {
            if (process.platform === 'linux') {
                execSync('pkill -f "PAYDAY3-Win64-Shipping"')
            } else {
                execSync('taskkill /F /IM PAYDAY3-Win64-Shipping.exe')
            }
        } catch {}
    })

    function steamBin(steamPath: string): string {
        if (process.platform !== 'win32') {
            const sh = join(steamPath, 'steam.sh')
            return existsSync(sh) ? sh : 'steam'
        }
        return join(steamPath, 'steam.exe')
    }

    function launchGame(launchOptions: string | undefined): void {
        const opts = launchOptions?.trim()
        const steamPath = findSteamPath()
        if (opts && steamPath) {
            const child = spawn(
                steamBin(steamPath),
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
    ipcMain.handle('shell:open-path', (_, path: string) => shell.openPath(path))

    ipcMain.handle('app:launch-without-mods', (_, gamePath: string) => {
        const modsDir = join(gamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
        const modsBak = join(gamePath, 'PAYDAY3', 'Content', '~mods.bak')
        if (existsSync(modsDir)) {
            try {
                renameSync(modsDir, modsBak)
            } catch (e) {
                throw new Error(
                    `Could not hide mods folder — the game may still have files open. Close the game first and try again. (${(e as NodeJS.ErrnoException).code})`
                )
            }
        }
        const { launchOptions } = readSettings(settingsPath)
        launchGame(launchOptions)
    })

    ipcMain.handle('app:restore-mods', () => {
        if (!resolvedGamePath) return
        const modsDir = join(resolvedGamePath, 'PAYDAY3', 'Content', 'Paks', '~mods')
        const modsBak = join(resolvedGamePath, 'PAYDAY3', 'Content', '~mods.bak')
        if (!existsSync(modsBak)) return
        if (!existsSync(modsDir)) {
            try {
                renameSync(modsBak, modsDir)
            } catch (e) {
                rmSync(modsBak, { recursive: true, force: true })
                throw new Error(
                    `Could not restore mods folder. You may need to manually rename ~mods.bak back to ~mods. (${(e as NodeJS.ErrnoException).code})`
                )
            }
        } else {
            rmSync(modsBak, { recursive: true, force: true })
        }
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

    ipcMain.handle('updater:download', async (event, version: string) => {
        if (updateStrategy === 'auto') {
            await autoUpdater.downloadUpdate()
            return
        }
        const ext = updateStrategy === 'deb' ? 'deb' : 'rpm'
        const url = `https://github.com/ShulhaOleh/pd3-mod-manager/releases/download/v${version}/pd3-mod-manager.${ext}`
        const dest = await downloadFile(url, ext, (downloaded, total) => {
            const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
            event.sender.send('updater:download-progress', percent)
        })
        await shell.openPath(dest)
    })

    ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())
}

type UpdateStrategy = 'auto' | 'deb' | 'rpm' | 'browser'
let updateStrategy: UpdateStrategy = 'browser'

function getUpdateStrategy(): UpdateStrategy {
    if (process.platform === 'win32') return 'auto'
    if (process.env.APPIMAGE) return 'auto'
    if (existsSync('/usr/bin/dpkg')) return 'deb'
    if (existsSync('/usr/bin/rpm')) return 'rpm'
    return 'browser'
}

function newerVersion(latest: string, current: string): boolean {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
    const [lMaj, lMin, lPatch] = parse(latest)
    const [cMaj, cMin, cPatch] = parse(current)
    if (lMaj !== cMaj) return lMaj > cMaj
    if (lMin !== cMin) return lMin > cMin
    return lPatch > cPatch
}

async function checkForUpdates(win: BrowserWindow): Promise<void> {
    updateStrategy = app.isPackaged ? getUpdateStrategy() : 'browser'

    if (updateStrategy === 'auto') {
        autoUpdater.autoDownload = false
        autoUpdater.checkForUpdates()
        autoUpdater.on('update-available', async (info) => {
            let body = ''
            let releaseUrl = `https://github.com/ShulhaOleh/pd3-mod-manager/releases/tag/v${info.version}`
            try {
                const r = await fetch(
                    `https://api.github.com/repos/ShulhaOleh/pd3-mod-manager/releases/tags/v${info.version}`,
                    { headers: { 'User-Agent': `pd3-mod-manager/${app.getVersion()}` } }
                )
                if (r.ok) {
                    const data = (await r.json()) as { body: string; html_url: string }
                    body = data.body ?? ''
                    releaseUrl = data.html_url
                }
            } catch {}
            win.webContents.send('updater:update-available', {
                version: info.version,
                strategy: 'auto',
                body,
                releaseUrl,
            })
        })
        autoUpdater.on('download-progress', ({ percent }: { percent: number }) => {
            win.webContents.send('updater:download-progress', Math.round(percent))
        })
        autoUpdater.on('update-downloaded', () => {
            win.webContents.send('updater:update-ready')
        })
        return
    }

    try {
        const res = await fetch(
            'https://api.github.com/repos/ShulhaOleh/pd3-mod-manager/releases/latest',
            {
                headers: { 'User-Agent': `pd3-mod-manager/${app.getVersion()}` },
                signal: AbortSignal.timeout(10_000),
            }
        )
        if (!res.ok) return
        const { tag_name, body, html_url } = (await res.json()) as {
            tag_name: string
            body: string
            html_url: string
        }
        const version = tag_name.replace(/^v/, '')
        if (newerVersion(tag_name, app.getVersion())) {
            const strategy =
                updateStrategy === 'deb' || updateStrategy === 'rpm' ? 'manual' : 'browser'
            win.webContents.send('updater:update-available', {
                version,
                strategy,
                body: body ?? '',
                releaseUrl: html_url,
            })
        }
    } catch {
        // best-effort — silently ignore network errors
    }
}

function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: join(
            __dirname,
            process.platform === 'linux' ? '../../assets/icon.png' : '../../assets/icon.ico'
        ),
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

        const newStatePath = getStatePath(resolvedGamePath)
        if (existsSync(legacyStatePath) && !existsSync(newStatePath)) {
            if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })
            renameSync(legacyStatePath, newStatePath)
        }
    }

    registerHandlers()
    const win = createWindow()
    if (!app.isPackaged) {
        globalShortcut.register('CommandOrControl+Shift+I', () => win.webContents.toggleDevTools())
    }
    win.webContents.once('did-finish-load', () => checkForUpdates(win))
})
