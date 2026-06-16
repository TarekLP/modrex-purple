import { useState } from 'react'
import { X } from 'lucide-react'
import type { GameId, InstalledMod } from '../../../shared/types'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import { api } from '../api'

export interface HostPackPayload {
    zipPath: string
    entries: string[]
    hostModId: number
    hostName: string
    hostSubpath: string
    modId: number
    modName: string
    fileId: number
    fileType: string
    modVersion: string
}

export function parseHostModPack(error: string): HostPackPayload | null {
    const PREFIX = 'HOST_MOD_PACK:'
    if (!error.startsWith(PREFIX)) return null
    try {
        return JSON.parse(error.slice(PREFIX.length)) as HostPackPayload
    } catch {
        return null
    }
}

interface Props {
    payload: HostPackPayload
    gamePath: string
    installed: InstalledMod[]
    gameId?: GameId
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
}

function setName(entry: string): string {
    return entry.split('/').filter(Boolean).pop() ?? entry
}

/**
 * Confirms installing a content pack (e.g. Menu Backgrounds sets) into its host mod. When the
 * host mod isn't installed yet, offers to install it first; otherwise installs each set into the
 * host's folder via `install_host_pack`.
 */
export function HostPackModal({
    payload,
    gamePath,
    installed,
    gameId,
    onRefreshInstalled,
    onClose,
}: Props) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const hostInstalled = installed.some((m) => m.id === payload.hostModId)

    async function handleInstallHost() {
        setBusy(true)
        setError(null)
        try {
            await api.installMod(payload.hostModId, gamePath, gameId)
            await onRefreshInstalled()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    async function handleInstall() {
        setBusy(true)
        setError(null)
        try {
            for (const entry of payload.entries) {
                await api.installHostPack(
                    payload.zipPath,
                    entry,
                    payload.modId,
                    payload.modName,
                    payload.fileId,
                    payload.fileType,
                    payload.modVersion,
                    gamePath,
                    payload.hostModId,
                    payload.hostSubpath,
                    gameId
                )
            }
            await api.deleteTempFile(payload.zipPath)
            await onRefreshInstalled()
            onClose()
        } catch (e) {
            setError(String(e))
            setBusy(false)
        }
    }

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && !busy && onClose()}
            title={t('hostPack.title')}
            className="w-[460px]"
        >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{t('hostPack.title')}</h2>
                    <p className="text-xs text-text-muted mt-0.5 truncate">{payload.modName}</p>
                </div>
                <button
                    onClick={!busy ? onClose : undefined}
                    disabled={busy}
                    className="text-text-subtle hover:text-text transition-colors shrink-0 mt-0.5 disabled:opacity-40"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
                {error && (
                    <div className="px-4 py-3 rounded-lg bg-danger/30 border border-danger-hover text-sm text-danger-text">
                        {error}
                    </div>
                )}
                {hostInstalled ? (
                    <>
                        <p className="text-sm text-text-muted">
                            {t('hostPack.intoHost', {
                                hostName: payload.hostName,
                                count: payload.entries.length,
                            })}
                        </p>
                        <div className="flex flex-col gap-1.5">
                            {payload.entries.map((entry) => (
                                <div
                                    key={entry}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover text-sm"
                                >
                                    <span className="truncate">{setName(entry)}</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-text-muted">
                        {t('hostPack.requiresHost', { hostName: payload.hostName })}
                    </p>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                <button
                    onClick={!busy ? onClose : undefined}
                    disabled={busy}
                    className="text-xs px-3 py-1.5 rounded border border-border bg-surface-hover hover:bg-surface-active disabled:opacity-40 transition-colors"
                >
                    {t('common.cancel')}
                </button>
                <button
                    disabled={busy}
                    onClick={hostInstalled ? handleInstall : handleInstallHost}
                    className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {busy
                        ? t('hostPack.installing')
                        : hostInstalled
                          ? t('hostPack.install', { count: payload.entries.length })
                          : t('hostPack.installHost', { hostName: payload.hostName })}
                </button>
            </div>
        </Dialog>
    )
}
