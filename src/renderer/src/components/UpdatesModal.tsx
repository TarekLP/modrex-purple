import { useState } from 'react'
import { X } from 'lucide-react'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import type { InstalledMod, Mod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { api } from '../api'

interface Props {
    updatable: InstalledMod[]
    modData: Map<number, Mod>
    gamePath: string | null
    gameId?: string
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
    onOpenDetail: (modId: number) => void
}

export function UpdatesModal({
    updatable,
    modData,
    gamePath,
    gameId,
    onRefreshInstalled,
    onClose,
    onOpenDetail,
}: Props) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(
        () => new Set(updatable.map((m) => m.id))
    )
    const [loadingMod, setLoadingMod] = useState<string | null>(null)
    const [updatingAll, setUpdatingAll] = useState(false)
    const [updateError, setUpdateError] = useState<string | null>(null)

    function toggleSelected(id: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    async function handleUpdate(uid: string, modId: number) {
        if (!gamePath) return
        setLoadingMod(uid)
        setUpdateError(null)
        try {
            await api.installMod(modId, gamePath, gameId)
            await onRefreshInstalled()
        } catch {
            setUpdateError(t('installed.updatesModal.error'))
        } finally {
            setLoadingMod(null)
        }
    }

    async function handleUpdateSelected() {
        if (!gamePath) return
        setUpdatingAll(true)
        setUpdateError(null)
        try {
            for (const ins of updatable.filter((m) => selectedIds.has(m.id))) {
                await api.installMod(ins.id, gamePath, gameId)
            }
            await onRefreshInstalled()
            onClose()
        } catch {
            setUpdateError(t('installed.updatesModal.error'))
        } finally {
            setUpdatingAll(false)
        }
    }

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && onClose()}
            title={t('installed.updatesModal.title', { count: updatable.length })}
            className="w-[32rem]"
        >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">
                    {t('installed.updatesModal.title', { count: updatable.length })}
                </h2>
                <button
                    onClick={onClose}
                    className="text-text-subtle hover:text-text transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
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
                                onClick={() => {
                                    onClose()
                                    onOpenDetail(ins.id)
                                }}
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
                                    <div className="text-sm font-medium truncate">{mod.name}</div>
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
                <button
                    onClick={onClose}
                    className="text-xs px-3 py-1 rounded border border-border bg-surface-hover hover:bg-surface-active transition-colors"
                >
                    {t('common.close')}
                </button>
                <button
                    disabled={!gamePath || updatingAll || selectedIds.size === 0}
                    onClick={handleUpdateSelected}
                    className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {updatingAll
                        ? t('installed.updatesModal.updating')
                        : t('installed.updatesModal.updateSelected', {
                              count: selectedIds.size,
                          })}
                </button>
            </div>
        </Dialog>
    )
}
