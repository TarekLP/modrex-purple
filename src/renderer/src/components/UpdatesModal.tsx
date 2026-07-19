import { useRef, useState } from 'react'
import { Button } from './ui/Button'
import { X } from 'lucide-react'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import type { GameId, InstalledMod, Mod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { api } from '../api'
import type { InstallOutcome } from '../api'
import {
    ZipPickerModal,
    computeAutoUpdateSelection,
    installZipPickerEntries,
} from './ZipPickerModal'
import type { ZipMultiPakPayload } from './ZipPickerModal'
import { HostPackModal } from './HostPackModal'
import type { HostPackPayload } from './HostPackModal'
import { CrimeBossFlatArchiveModal } from './CrimeBossFlatArchiveModal'
import type { CbFlatArchivePayload } from './CrimeBossFlatArchiveModal'
import { UnrecognizedArchiveModal } from './UnrecognizedArchiveModal'

interface Props {
    updatable: InstalledMod[]
    modData: Map<number, Mod>
    installed: InstalledMod[]
    gamePath: string | null
    gameId?: string
    visible: boolean
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
    onOpenDetail: (modId: number) => void
}

export function UpdatesModal({
    updatable,
    modData,
    installed,
    gamePath,
    gameId,
    visible,
    onRefreshInstalled,
    onClose,
    onOpenDetail,
}: Props) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(
        () => new Set(updatable.map((m) => m.id))
    )
    const [loadingMod, setLoadingMod] = useState<string | null>(null)
    const [updatingAll, setUpdatingAll] = useState(false)
    const [updateProgress, setUpdateProgress] = useState<{ done: number; total: number } | null>(
        null
    )
    const [updateError, setUpdateError] = useState<string | null>(null)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)
    const [hostPackData, setHostPackData] = useState<HostPackPayload | null>(null)
    const [cbFlatArchiveData, setCbFlatArchiveData] = useState<CbFlatArchivePayload | null>(null)
    const [unrecognizedModId, setUnrecognizedModId] = useState<number | null>(null)

    // Remaining mods for the in-progress batch update; lets processQueue resume after a
    // picker modal closes instead of abandoning the rest of the selection.
    const queueRef = useRef<InstalledMod[]>([])

    function toggleSelected(id: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // The user already decided to update, so never re-prompt for file selection: re-apply
    // the prior selection when filenames match, otherwise install all entries.
    // 'resolved' = handled silently; 'manual' = picker open, caller must pause.
    async function resolveInstallPrompt(
        outcome: Exclude<InstallOutcome, 'installed'>,
        modId: number
    ): Promise<'resolved' | 'manual'> {
        if (outcome === 'unrecognized') {
            setUnrecognizedModId(modId)
            return 'manual'
        }
        if ('needsPicker' in outcome) {
            const zipData = outcome.needsPicker as unknown as ZipMultiPakPayload
            if (gamePath) {
                const autoEntries = computeAutoUpdateSelection(zipData, installed)
                const entriesToInstall = autoEntries ?? zipData.entries
                try {
                    await installZipPickerEntries(
                        zipData,
                        entriesToInstall,
                        gamePath,
                        gameId,
                        null,
                        onRefreshInstalled
                    )
                    return 'resolved'
                } catch {
                    // fall back to the picker if the install fails
                }
            }
            setZipPickerData(zipData)
            return 'manual'
        }
        if ('needsHostChoice' in outcome) {
            setHostPackData(outcome.needsHostChoice as unknown as HostPackPayload)
            return 'manual'
        }
        setCbFlatArchiveData(outcome.needsCbFlatConfirm as unknown as CbFlatArchivePayload)
        return 'manual'
    }

    async function handleUpdate(uid: string, modId: number) {
        if (!gamePath) return
        setLoadingMod(uid)
        setUpdateError(null)
        try {
            const outcome = await api.installMod(modId, gamePath, gameId)
            if (outcome === 'installed') {
                await onRefreshInstalled()
            } else {
                await resolveInstallPrompt(outcome, modId)
            }
        } catch {
            setUpdateError(t('installed.updatesModal.error'))
        } finally {
            setLoadingMod(null)
        }
    }

    // Stops without finishing the batch when a sentinel needs a manual picker; the picker's
    // onClose calls this again to resume with the next mod.
    async function processQueue() {
        if (!gamePath) return
        while (queueRef.current.length > 0) {
            const ins = queueRef.current[0]
            queueRef.current = queueRef.current.slice(1)
            try {
                const outcome = await api.installMod(ins.id, gamePath, gameId)
                setUpdateProgress((prev) => prev && { done: prev.done + 1, total: prev.total })
                if (outcome !== 'installed') {
                    const resolution = await resolveInstallPrompt(outcome, ins.id)
                    // 'resolved' = auto-applied silently, continue with the next mod;
                    // 'manual' = picker handles this mod, pause until its onClose resumes.
                    if (resolution === 'manual') return
                }
            } catch {
                setUpdateError(t('installed.updatesModal.error'))
                setUpdatingAll(false)
                setUpdateProgress(null)
                queueRef.current = []
                return
            }
        }
        await onRefreshInstalled()
        setUpdatingAll(false)
        setUpdateProgress(null)
        onClose()
    }

    function resumeQueueIfBatch() {
        if (updatingAll) void processQueue()
    }

    async function handleUpdateSelected() {
        if (!gamePath) return
        setUpdateError(null)
        setUpdatingAll(true)
        const queue = updatable.filter((m) => selectedIds.has(m.id))
        queueRef.current = queue
        setUpdateProgress({ done: 0, total: queue.length })
        await processQueue()
    }

    return (
        <>
            <Dialog
                open={visible}
                onOpenChange={(open) => !open && onClose()}
                title={t('installed.updatesModal.title', { count: updatable.length })}
                className="w-[32rem]"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <h2 className="text-sm font-semibold">
                        {t('installed.updatesModal.title', { count: updatable.length })}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose} className="-m-1">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="overflow-y-auto max-h-96">
                    {updatable.map((ins) => {
                        const mod = modData.get(ins.id)!
                        const checked = selectedIds.has(ins.id)
                        const isLoading = loadingMod === ins.uid || updatingAll
                        return (
                            <div
                                key={ins.uid}
                                className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={updatingAll}
                                    onChange={() => toggleSelected(ins.id)}
                                    className="accent-[oklch(0.65_0.18_47)] w-4 h-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                                />
                                <button
                                    onClick={() => onOpenDetail(ins.id)}
                                    className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                                >
                                    {mod.thumbnail ? (
                                        <img
                                            src={`${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}`}
                                            alt=""
                                            className="w-9 h-9 rounded object-cover shrink-0"
                                        />
                                    ) : (
                                        <div className="w-9 h-9 rounded bg-surface-active shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium truncate">
                                            {mod.name}
                                        </div>
                                        <div className="text-xs text-text-subtle">
                                            {ins.version} to {mod.version}
                                        </div>
                                    </div>
                                </button>
                                <button
                                    disabled={!gamePath || isLoading}
                                    onClick={() => handleUpdate(ins.uid, ins.id)}
                                    className="text-xs px-3 py-1 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                >
                                    {loadingMod === ins.uid
                                        ? t('installed.updatesModal.updating')
                                        : t('installed.updatesModal.update')}
                                </button>
                            </div>
                        )
                    })}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                    {updateError && (
                        <span className="text-xs text-danger-text mr-auto">{updateError}</span>
                    )}
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        {t('common.close')}
                    </Button>
                    <Button
                        variant="accent"
                        size="sm"
                        disabled={!gamePath || updatingAll || selectedIds.size === 0}
                        onClick={handleUpdateSelected}
                    >
                        {updatingAll && updateProgress
                            ? t('installed.updatesModal.updatingProgress', {
                                  done: updateProgress.done,
                                  total: updateProgress.total,
                              })
                            : updatingAll
                              ? t('installed.updatesModal.updating')
                              : t('installed.updatesModal.updateSelected', {
                                    count: selectedIds.size,
                                })}
                    </Button>
                </div>
            </Dialog>
            {zipPickerData && gamePath && (
                <ZipPickerModal
                    payload={zipPickerData}
                    gamePath={gamePath}
                    installedFiles={installed}
                    gameId={gameId}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => {
                        setZipPickerData(null)
                        resumeQueueIfBatch()
                    }}
                />
            )}
            {hostPackData && gamePath && (
                <HostPackModal
                    payload={hostPackData}
                    gamePath={gamePath}
                    installed={installed}
                    gameId={gameId as GameId | undefined}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => {
                        setHostPackData(null)
                        resumeQueueIfBatch()
                    }}
                />
            )}
            {cbFlatArchiveData && gamePath && (
                <CrimeBossFlatArchiveModal
                    payload={cbFlatArchiveData}
                    gamePath={gamePath}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => {
                        setCbFlatArchiveData(null)
                        resumeQueueIfBatch()
                    }}
                />
            )}
            {unrecognizedModId !== null && (
                <UnrecognizedArchiveModal
                    modId={unrecognizedModId}
                    onClose={() => {
                        setUnrecognizedModId(null)
                        resumeQueueIfBatch()
                    }}
                />
            )}
        </>
    )
}
