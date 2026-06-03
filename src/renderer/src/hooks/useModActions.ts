import { useState } from 'react'
import type { InstalledMod } from '../../../shared/types'
import type { ZipMultiPakPayload } from '../components/ZipPickerModal'
import { parseZipMultiPak } from '../components/ZipPickerModal'
import { api } from '../api'

export interface ModActions {
    loadingMod: string | null
    refreshing: boolean
    zipPickerData: ZipMultiPakPayload | null
    clearZipPickerData: () => void
    handleRefresh: () => Promise<void>
    handleUninstall: (mods: InstalledMod[]) => Promise<void>
    handleEnable: (mods: InstalledMod[]) => Promise<void>
    handleDisable: (mods: InstalledMod[]) => Promise<void>
    handleReinstall: (mods: InstalledMod[]) => Promise<void>
}

export function useModActions(
    gamePath: string | null,
    onRefreshInstalled: () => Promise<void>
): ModActions {
    const [loadingMod, setLoadingMod] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)

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
            for (const m of mods) await api.uninstallMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleEnable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.enableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleDisable(mods: InstalledMod[]) {
        if (!gamePath) return
        setLoadingMod(mods[0].uid)
        try {
            for (const m of mods) await api.disableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleReinstall(mods: InstalledMod[]) {
        if (!gamePath || mods[0].id < 0) return
        setLoadingMod(mods[0].uid)
        try {
            await api.installMod(mods[0].id, gamePath)
            await onRefreshInstalled()
        } catch (e) {
            const zipData = parseZipMultiPak(String(e))
            if (zipData) setZipPickerData(zipData)
        } finally {
            setLoadingMod(null)
        }
    }

    return {
        loadingMod,
        refreshing,
        zipPickerData,
        clearZipPickerData: () => setZipPickerData(null),
        handleRefresh,
        handleUninstall,
        handleEnable,
        handleDisable,
        handleReinstall,
    }
}
