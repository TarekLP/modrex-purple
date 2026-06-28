import { useState } from 'react'
import type { GameId, InstalledMod } from '../../../shared/types'
import type { ZipMultiPakPayload } from '../components/ZipPickerModal'
import { parseZipMultiPak, installZipPickerEntries } from '../components/ZipPickerModal'
import type { HostPackPayload } from '../components/HostPackModal'
import type { CbFlatArchivePayload } from '../components/CrimeBossFlatArchiveModal'
import { handleInstallSentinel } from '../installSentinels'
import { entryFilename, stripPriorityPrefix } from './installedUtils'
import { api } from '../api'

export interface ModActions {
    loadingMod: string | null
    reinstallProgress: { downloaded: number; total: number } | null
    reinstallError: string | null
    clearReinstallError: () => void
    refreshing: boolean
    zipPickerData: ZipMultiPakPayload | null
    clearZipPickerData: () => void
    hostPackData: HostPackPayload | null
    clearHostPackData: () => void
    unrecognizedModId: number | null
    clearUnrecognizedModId: () => void
    cbFlatArchiveData: CbFlatArchivePayload | null
    clearCbFlatArchiveData: () => void
    movingCrimeBossTarget: InstalledMod | null
    crimeBossMoveBusy: boolean
    crimeBossMoveError: string | null
    handleRefresh: () => Promise<void>
    handleUninstall: (mods: InstalledMod[]) => Promise<void>
    handleEnable: (mods: InstalledMod[]) => Promise<void>
    handleDisable: (mods: InstalledMod[]) => Promise<void>
    handleReinstall: (mods: InstalledMod[]) => Promise<void>
    requestMoveCrimeBossTarget: (mod: InstalledMod) => void
    confirmMoveCrimeBossTarget: () => Promise<void>
    cancelMoveCrimeBossTarget: () => void
}

export function useModActions(
    gamePath: string | null,
    onRefreshInstalled: () => Promise<void>,
    activeGame?: GameId
): ModActions {
    const [loadingMod, setLoadingMod] = useState<string | null>(null)
    const [reinstallProgress, setReinstallProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const [reinstallError, setReinstallError] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)
    const [hostPackData, setHostPackData] = useState<HostPackPayload | null>(null)
    const [unrecognizedModId, setUnrecognizedModId] = useState<number | null>(null)
    const [cbFlatArchiveData, setCbFlatArchiveData] = useState<CbFlatArchivePayload | null>(null)
    const [movingCrimeBossTarget, setMovingCrimeBossTarget] = useState<InstalledMod | null>(null)
    const [crimeBossMoveBusy, setCrimeBossMoveBusy] = useState(false)
    const [crimeBossMoveError, setCrimeBossMoveError] = useState<string | null>(null)

    async function handleRefresh() {
        setRefreshing(true)
        try {
            await onRefreshInstalled()
        } finally {
            setRefreshing(false)
        }
    }

    async function handleUninstall(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.uninstallMod(m.uid, gamePath, activeGame)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.enableMod(m.uid, gamePath, activeGame)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.disableMod(m.uid, gamePath, activeGame)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleReinstall(mods: InstalledMod[]) {
        if (!gamePath || mods[0].id < 0) return

        const missingMods = mods.filter((m) => m.missing)

        setLoadingMod(mods[0].uid)
        setReinstallProgress(null)
        setReinstallError(null)

        // ZIP-installed paks use {file_id}_{stem} uids; install_mod creates {file_id} — old entries stay missing without this.
        for (const m of missingMods) {
            await api.uninstallMod(m.uid, gamePath, activeGame)
        }

        const targetId = `mod:${mods[0].id}`
        const unsub = api.onDownloadProgress(({ download_id, downloaded, total }) => {
            if (download_id === targetId) setReinstallProgress({ downloaded, total })
        })
        try {
            await api.installMod(mods[0].id, gamePath, activeGame)
        } catch (e) {
            const errStr = String(e)
            const zipPayload = parseZipMultiPak(errStr)
            if (zipPayload) {
                // install_from_zip_entry's pre-removal only fires when exactly one other entry
                // shares the mod id; for multi-pak mods (2+ entries) stale entries survive and
                // keep the group outdated. missingMods were already removed above.
                // ZipPickerModal is also blocked by Radix's focus trap when HealthCheckModal is open.
                const priorMods = mods.filter((m) => !m.missing)
                for (const m of priorMods) {
                    await api.uninstallMod(m.uid, gamePath, activeGame)
                }
                const toReinstall = zipPayload.entries.filter((entry) =>
                    priorMods.some((m) => stripPriorityPrefix(m.filename) === entryFilename(entry))
                )
                if (toReinstall.length > 0) {
                    try {
                        await installZipPickerEntries(
                            zipPayload,
                            toReinstall,
                            gamePath,
                            activeGame,
                            mods[0].folderId ?? null,
                            onRefreshInstalled
                        )
                    } catch (installErr) {
                        setReinstallError(String(installErr))
                    }
                } else {
                    setZipPickerData(zipPayload)
                }
            } else {
                const handled = handleInstallSentinel(errStr, {
                    onZipMultiPak: setZipPickerData, // unreachable: parseZipMultiPak already returned null
                    onHostModPack: setHostPackData,
                    onCbFlatArchive: setCbFlatArchiveData,
                    onUnrecognizedArchive: () => setUnrecognizedModId(mods[0].id),
                })
                if (!handled) setReinstallError(errStr)
            }
        } finally {
            unsub()
            setReinstallProgress(null)
            setLoadingMod(null)
        }
        await onRefreshInstalled()
    }

    // Both directions ask for confirmation before moving — Mods/ (ModKit) -> ~mods drops Data
    // Table merge behavior, ~mods -> Mods/ only gains it, but either way the move is silent
    // otherwise, so the dialog is also the only feedback that anything happened.
    function requestMoveCrimeBossTarget(mod: InstalledMod) {
        setCrimeBossMoveError(null)
        setMovingCrimeBossTarget(mod)
    }

    async function doMoveCrimeBossTarget(mod: InstalledMod) {
        if (!gamePath) return
        setCrimeBossMoveBusy(true)
        setCrimeBossMoveError(null)
        try {
            await api.moveCrimeBossModTarget(mod.uid, gamePath)
            await onRefreshInstalled()
            setMovingCrimeBossTarget(null)
        } catch (e) {
            setCrimeBossMoveError(String(e))
        } finally {
            setCrimeBossMoveBusy(false)
        }
    }

    async function confirmMoveCrimeBossTarget() {
        if (movingCrimeBossTarget) await doMoveCrimeBossTarget(movingCrimeBossTarget)
    }

    function cancelMoveCrimeBossTarget() {
        setMovingCrimeBossTarget(null)
        setCrimeBossMoveError(null)
    }

    return {
        loadingMod,
        reinstallProgress,
        reinstallError,
        clearReinstallError: () => setReinstallError(null),
        refreshing,
        zipPickerData,
        clearZipPickerData: () => setZipPickerData(null),
        hostPackData,
        clearHostPackData: () => setHostPackData(null),
        unrecognizedModId,
        clearUnrecognizedModId: () => setUnrecognizedModId(null),
        cbFlatArchiveData,
        clearCbFlatArchiveData: () => setCbFlatArchiveData(null),
        movingCrimeBossTarget,
        crimeBossMoveBusy,
        crimeBossMoveError,
        handleRefresh,
        handleUninstall,
        handleEnable,
        handleDisable,
        handleReinstall,
        requestMoveCrimeBossTarget,
        confirmMoveCrimeBossTarget,
        cancelMoveCrimeBossTarget,
    }
}
