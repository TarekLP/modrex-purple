import { getLogPath } from './logger'
import { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
import { join } from 'path'
import { rmSync, renameSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
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
import { autoDetect, identifyLauncher, launchGame as registryLaunchGame } from './launchers/index'
import { PD3 } from './launchers/games/pd3'
import type { LauncherId } from './launchers/types'
import {
    installMod,
    reorderModsInFolder,
    moveModToFolder,
    reorderChildren,
    moveFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    uninstallMod,
    enableMod,
    disableMod,
    readState,
    reconcileState,
    findUntrackedPaks,
    computeSha256,
    activeModPath,
    disabledModPath,
    stripPriorityPrefix,
    getFolderPath,
    makeUid,
} from './mods'
import type { ModFolder, TopLevelItem } from '../shared/types'
import { downloadFile } from './download'
import { readSettings, writeSettings } from './settings'
import { ensureIndex, lookupSha256, lookupByName } from './mod-index'

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
let resolvedLauncher: LauncherId | 'manual' = 'steam'

function registerHandlers(): void {
    ipcMain.handle('api:list-mods', (_, params: ListModsParams) => listMods(params))
    ipcMain.handle('api:list-categories', () => listCategories())
    ipcMain.handle('api:get-mod', (_, id: number) => getMod(id))
    ipcMain.handle('api:list-mod-files', (_, modId: number) => listModFiles(modId))

    ipcMain.handle('mods:find-game-path', () => resolvedGamePath)
    ipcMain.handle('mods:open-folder', () => {
        if (!resolvedGamePath) return
        shell.openPath(join(resolvedGamePath, 'PAYDAY3', 'Content', 'Paks', '~mods'))
    })

    ipcMain.handle('settings:get', () => readSettings(settingsPath))
    ipcMain.handle('settings:set-game-path', (_, gamePath: string | null) => {
        if (gamePath && !existsSync(join(gamePath, 'PAYDAY3', 'Content', 'Paks'))) {
            throw new Error('Not a valid PAYDAY 3 installation')
        }
        const settings = readSettings(settingsPath)
        if (gamePath) {
            settings.gamePath = gamePath
            settings.launcher = identifyLauncher(gamePath)
            resolvedGamePath = gamePath
            resolvedLauncher = settings.launcher
        } else {
            delete settings.gamePath
            delete settings.launcher
            const detected = autoDetect(PD3)
            resolvedGamePath = detected?.gamePath ?? null
            resolvedLauncher = detected?.launcher ?? 'steam'
            if (detected) settings.launcher = detected.launcher
        }
        writeSettings(settingsPath, settings)
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
        let state = resolvedGamePath
            ? await reconcileState(resolvedGamePath, statePath)
            : readState(statePath)

        const modsHidden =
            !!resolvedGamePath &&
            existsSync(join(resolvedGamePath, 'PAYDAY3', 'Content', '~mods.bak'))

        if (!resolvedGamePath) return { mods: state.mods, folders: state.folders, modsHidden }

        // Upgrade any synthetic mods (id < 0) once the index becomes available
        if (!modsHidden && state.mods.some((m) => m.id < 0)) {
            const upgraded = await Promise.all(
                state.mods.map(async (m) => {
                    if (m.id >= 0) return m
                    let sha256 = m.sha256
                    if (!sha256) {
                        try {
                            const folderDiskName =
                                state.folders.find((f) => f.id === m.folderId)?.diskName ?? null
                            const pakPath = m.enabled
                                ? activeModPath(resolvedGamePath!, m.filename, folderDiskName)
                                : disabledModPath(resolvedGamePath!, m.filename, folderDiskName)
                            sha256 = await computeSha256(pakPath)
                        } catch {
                            return m
                        }
                    }
                    const match = await lookupSha256(sha256)
                    const modRemoteId = match?.modRemoteId ?? (await lookupByName(m.name))
                    if (!modRemoteId) return { ...m, sha256 }
                    try {
                        const mod = await getMod(modRemoteId)
                        const fileId = match?.fileRemoteId ?? (await getLatestFile(modRemoteId)).id
                        const version = match?.version || mod.version
                        return {
                            ...m,
                            uid: String(fileId),
                            id: mod.id,
                            name: mod.name,
                            fileId,
                            version,
                            sha256,
                        }
                    } catch {
                        return { ...m, sha256 }
                    }
                })
            )
            if (upgraded.some((m, i) => m !== state.mods[i])) {
                state = { folders: state.folders, mods: upgraded }
                writeFileSync(statePath, JSON.stringify(state, null, 4))
            }
        }

        const knownRelPaths = new Set(
            state.mods.map((m) => {
                const relPath = getFolderPath(state.folders, m.folderId)
                return relPath ? `${relPath}/${m.filename}` : m.filename
            })
        )
        const untracked = await findUntrackedPaks(resolvedGamePath, knownRelPaths, state.folders)
        if (untracked.length === 0) return { mods: state.mods, folders: state.folders, modsHidden }

        function buildFolderByPath(foldersArr: ModFolder[]): Map<string, ModFolder> {
            const map = new Map<string, ModFolder>()
            for (const f of foldersArr) {
                const fullPath = getFolderPath(foldersArr, f.id)
                if (fullPath) map.set(fullPath, f)
            }
            return map
        }

        let folderByPath = buildFolderByPath(state.folders)

        let maxPriority = Math.max(
            0,
            ...state.folders.map((f) => f.priority),
            ...state.mods.filter((m) => !m.folderId).map((m) => m.priority ?? 0)
        )
        for (const { relPath } of untracked) {
            const parts = relPath.split('/')
            if (parts.length <= 1) continue
            const segments = parts.slice(0, -1)
            let prefix = ''
            for (let i = 0; i < segments.length; i++) {
                prefix = i === 0 ? segments[i] : `${prefix}/${segments[i]}`
                if (!folderByPath.has(prefix)) {
                    const parentPath = i === 0 ? null : segments.slice(0, i).join('/')
                    const parentId = parentPath ? (folderByPath.get(parentPath)?.id ?? null) : null
                    const diskName = segments[i]
                    const newFolder: ModFolder = {
                        id: randomUUID(),
                        diskName,
                        displayName: stripPriorityPrefix(diskName).replace(/_/g, ' ').trim(),
                        priority: ++maxPriority,
                        parentId,
                    }
                    state = { ...state, folders: [...state.folders, newFolder] }
                    folderByPath = buildFolderByPath(state.folders)
                }
            }
        }

        const sha256ToMod = new Map(state.mods.filter((m) => m.sha256).map((m) => [m.sha256!, m]))

        function parseRelPath(relPath: string): { filename: string; folderId: string | null } {
            const parts = relPath.split('/')
            if (parts.length === 1) return { filename: parts[0], folderId: null }
            const filename = parts[parts.length - 1]
            const folderPath = parts.slice(0, -1).join('/')
            const folderId = folderByPath.get(folderPath)?.id ?? null
            return { filename, folderId }
        }

        const hashedResults = await Promise.allSettled(
            untracked.map(async ({ relPath, enabled }) => {
                const { filename, folderId } = parseRelPath(relPath)
                const folderDiskName =
                    state.folders.find((f) => f.id === folderId)?.diskName ?? null
                const pakPath = enabled
                    ? activeModPath(resolvedGamePath!, filename, folderDiskName)
                    : disabledModPath(resolvedGamePath!, filename, folderDiskName)
                const sha256 = await computeSha256(pakPath)
                return { filename, folderId, enabled, sha256 }
            })
        )
        const hashed = hashedResults.map((r, i) => {
            const { filename, folderId } = parseRelPath(untracked[i].relPath)
            return r.status === 'fulfilled'
                ? r.value
                : { filename, folderId, enabled: untracked[i].enabled, sha256: null }
        })

        let reconciledMods = [...state.mods]
        const trulyUntracked: {
            filename: string
            folderId: string | null
            enabled: boolean
            sha256: string | null
        }[] = []

        for (const { filename, folderId, enabled, sha256 } of hashed) {
            const matched = sha256 ? sha256ToMod.get(sha256) : undefined
            if (matched) {
                reconciledMods = reconciledMods.map((m) =>
                    m.uid === matched.uid
                        ? { ...m, filename, folderId, enabled, missing: undefined }
                        : m
                )
            } else {
                trulyUntracked.push({ filename, folderId, enabled, sha256 })
            }
        }

        const results = await Promise.allSettled(
            trulyUntracked.map(async ({ filename, folderId, enabled, sha256 }) => {
                const indexMatch = sha256 ? await lookupSha256(sha256) : null
                if (indexMatch) {
                    const mod = await getMod(indexMatch.modRemoteId)
                    return {
                        uid: String(indexMatch.fileRemoteId),
                        id: mod.id,
                        name: mod.name,
                        fileId: indexMatch.fileRemoteId,
                        version: indexMatch.version || mod.version,
                        ...(sha256 ? { sha256 } : {}),
                        filename,
                        folderId,
                        enabled,
                        installedAt: new Date().toISOString(),
                    }
                }
                const stem = filename.slice(0, -4)
                const numId = parseInt(stem, 10)
                if (!isNaN(numId) && String(numId) === stem) {
                    const mod = await getMod(numId)
                    return {
                        uid: makeUid(undefined, filename),
                        id: mod.id,
                        name: mod.name,
                        version: mod.version,
                        filename,
                        folderId,
                        enabled,
                        installedAt: new Date().toISOString(),
                    }
                }
                const nameId = await lookupByName(stripPriorityPrefix(stem))
                if (nameId) {
                    try {
                        const [mod, latestFile] = await Promise.all([
                            getMod(nameId),
                            getLatestFile(nameId),
                        ])
                        return {
                            uid: String(latestFile.id),
                            id: mod.id,
                            name: mod.name,
                            fileId: latestFile.id,
                            version: latestFile.version || mod.version,
                            ...(sha256 ? { sha256 } : {}),
                            filename,
                            folderId,
                            enabled,
                            installedAt: new Date().toISOString(),
                        }
                    } catch {}
                }
                return {
                    uid: makeUid(undefined, filename),
                    id: hashFilename(filename),
                    name: stripPriorityPrefix(stem),
                    version: 'unknown',
                    ...(sha256 ? { sha256 } : {}),
                    filename,
                    folderId,
                    enabled,
                    installedAt: new Date().toISOString(),
                }
            })
        )
        const newMods = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
        const modsByUid = new Map(reconciledMods.map((m) => [m.uid, m]))
        for (const m of newMods) modsByUid.set(m.uid, m)
        const finalMods = [...modsByUid.values()]
        const finalState = { folders: state.folders, mods: finalMods }
        writeFileSync(statePath, JSON.stringify(finalState, null, 4))
        return { mods: finalMods, folders: state.folders, modsHidden }
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
            const sha256 = await computeSha256(tmp)
            const uid = String(file.id)
            installMod(
                gamePath,
                statePath,
                {
                    uid,
                    id: mod.id,
                    name: mod.name,
                    version: mod.version,
                    filename:
                        readState(statePath).mods.find((m) => m.uid === uid)?.filename ??
                        pakFilename(mod.name),
                    enabled: true,
                    installedAt: new Date().toISOString(),
                    fileId: file.id,
                    fileType: file.type,
                    sha256,
                },
                tmp
            )
            await registerDownload(file.id)
            console.info(`Installed mod ${mod.id} (${mod.name})`)
        } catch (e) {
            console.error(`Failed to install mod ${modId}:`, e)
            throw e
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
                const sha256 = await computeSha256(tmp)
                const uid = String(fileId)
                installMod(
                    gamePath,
                    statePath,
                    {
                        uid,
                        id: modId,
                        name: modName,
                        version: modVersion,
                        filename:
                            readState(statePath).mods.find((m) => m.uid === uid)?.filename ??
                            pakFilename(fileType === 'main' ? modName : `${modName}_${fileId}`),
                        enabled: true,
                        installedAt: new Date().toISOString(),
                        fileId,
                        fileType,
                        sha256,
                    },
                    tmp
                )
                await registerDownload(fileId)
            } finally {
                rmSync(tmp, { force: true })
            }
        }
    )

    ipcMain.handle('mods:uninstall', (_, uid: string, gamePath: string) =>
        uninstallMod(gamePath, getStatePath(gamePath), uid)
    )
    ipcMain.handle('mods:enable', (_, uid: string, gamePath: string) =>
        enableMod(gamePath, getStatePath(gamePath), uid)
    )
    ipcMain.handle('mods:disable', (_, uid: string, gamePath: string) =>
        disableMod(gamePath, getStatePath(gamePath), uid)
    )
    ipcMain.handle(
        'mods:reorder-in-folder',
        (_, folderId: string | null, orderedUids: string[], gamePath: string) =>
            reorderModsInFolder(gamePath, getStatePath(gamePath), folderId, orderedUids)
    )
    ipcMain.handle(
        'mods:move-to-folder',
        (_, uid: string, targetFolderId: string | null, targetPosition: number, gamePath: string) =>
            moveModToFolder(gamePath, getStatePath(gamePath), uid, targetFolderId, targetPosition)
    )
    ipcMain.handle(
        'folders:reorder-children',
        (_, parentId: string | null, items: TopLevelItem[], gamePath: string) =>
            reorderChildren(gamePath, getStatePath(gamePath), parentId, items)
    )
    ipcMain.handle(
        'folders:move',
        (_, folderId: string, targetParentId: string | null, gamePath: string) =>
            moveFolder(gamePath, getStatePath(gamePath), folderId, targetParentId)
    )
    ipcMain.handle(
        'folders:create',
        (_, displayName: string, parentId: string | null, gamePath: string) =>
            createFolder(gamePath, getStatePath(gamePath), displayName, parentId)
    )
    ipcMain.handle('folders:rename', (_, folderId: string, displayName: string, gamePath: string) =>
        renameFolder(gamePath, getStatePath(gamePath), folderId, displayName)
    )
    ipcMain.handle('folders:delete', (_, folderId: string, gamePath: string) =>
        deleteFolder(gamePath, getStatePath(gamePath), folderId)
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

    function launchGame(launchOptions: string | undefined): void {
        if (!resolvedGamePath) return
        registryLaunchGame(PD3, resolvedLauncher, resolvedGamePath, launchOptions)
    }

    ipcMain.handle('settings:set-launcher', (_, launcher: LauncherId | 'manual') => {
        const settings = readSettings(settingsPath)
        settings.launcher = launcher
        writeSettings(settingsPath, settings)
        resolvedLauncher = launcher
    })

    ipcMain.handle('app:launch-modded', () => {
        const { launchOptions } = readSettings(settingsPath)
        launchGame(launchOptions)
    })

    ipcMain.handle('shell:open-external', (_, url: string) => shell.openExternal(url))
    ipcMain.handle('shell:open-path', (_, path: string) => shell.openPath(path))
    ipcMain.handle('app:open-log', () => shell.openPath(getLogPath()))

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
        show: false,
        backgroundColor: '#0a0a0a',
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

    win.once('ready-to-show', () => win.show())

    return win
}

app.whenReady().then(() => {
    console.info(`PD3 Mod Manager ${app.getVersion()} starting on ${process.platform}`)
    const startupSettings = readSettings(settingsPath)
    if (startupSettings.gamePath) {
        resolvedGamePath = startupSettings.gamePath
        resolvedLauncher = startupSettings.launcher ?? identifyLauncher(startupSettings.gamePath)
    } else {
        const detected = autoDetect(PD3)
        resolvedGamePath = detected?.gamePath ?? null
        resolvedLauncher = detected?.launcher ?? 'steam'
        if (detected) {
            writeSettings(settingsPath, { ...startupSettings, launcher: detected.launcher })
        }
    }
    console.info(`Game path: ${resolvedGamePath ?? 'not found'} (${resolvedLauncher})`)
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

    ensureIndex().catch((e) => console.warn('mod index update failed:', e))
    registerHandlers()
    const win = createWindow()
    if (!app.isPackaged) {
        globalShortcut.register('CommandOrControl+Shift+I', () => win.webContents.toggleDevTools())
    }
    win.webContents.once('did-finish-load', () => checkForUpdates(win))
    ipcMain.handle('updater:check', () => checkForUpdates(win))
})
