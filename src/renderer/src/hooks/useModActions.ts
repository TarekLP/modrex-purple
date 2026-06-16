import { useState } from 'react'
import type { GameId, InstalledMod } from '../../../shared/types'
import type { ZipMultiPakPayload } from '../components/ZipPickerModal'
import { parseZipMultiPak } from '../components/ZipPickerModal'
import type { HostPackPayload } from '../components/HostPackModal'
import { parseHostModPack } from '../components/HostPackModal'
import { isUnrecognizedArchive } from '../components/UnrecognizedArchiveModal'
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
    handleRefresh: () => Promise<void>
    handleUninstall: (mods: InstalledMod[]) => Promise<void>
    handleEnable: (mods: InstalledMod[]) => Promise<void>
    handleDisable: (mods: InstalledMod[]) => Promise<void>
    handleReinstall: (mods: InstalledMod[]) => Promise<void>
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

        const unsub = api.onDownloadProgress(setReinstallProgress)
        try {
            await api.installMod(mods[0].id, gamePath, activeGame)
        } catch (e) {
            const errStr = String(e)
            const zipData = parseZipMultiPak(errStr)
            const hostData = parseHostModPack(errStr)
            if (zipData) {
                setZipPickerData(zipData)
            } else if (hostData) {
                setHostPackData(hostData)
            } else if (isUnrecognizedArchive(errStr)) {
                setUnrecognizedModId(mods[0].id)
            } else {
                setReinstallError(errStr)
            }
        } finally {
            unsub()
            setReinstallProgress(null)
            setLoadingMod(null)
        }
        await onRefreshInstalled()
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
        handleRefresh,
        handleUninstall,
        handleEnable,
        handleDisable,
        handleReinstall,
    }
}
