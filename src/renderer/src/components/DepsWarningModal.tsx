import { useState, useEffect } from 'react'
import { X, TriangleAlert } from 'lucide-react'
import type { ModDependency } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { t } from '../i18n'
import { api } from '../api'

interface Props {
    modId: number
    missingRequired: ModDependency[]
    gamePath: string | null
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
    onGotIt: (permanent: boolean) => void
}

export function DepsWarningModal({
    modId,
    missingRequired,
    gamePath,
    onRefreshInstalled,
    onClose,
    onGotIt,
}: Props) {
    const [dontShowAgain, setDontShowAgain] = useState(false)
    const [installingDeps, setInstallingDeps] = useState<Record<number, boolean>>({})

    useEffect(() => {
        if (missingRequired.length === 0) onClose()
    }, [missingRequired.length])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-surface-raised border border-border rounded-lg shadow-xl w-[480px] p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <TriangleAlert className="w-4 h-4 text-warning shrink-0" />
                            {t('depsWarning.title')}
                        </h2>
                        <p className="text-xs text-text-muted">{t('depsWarning.body')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-text-subtle hover:text-text transition-colors shrink-0 mt-0.5"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex flex-col gap-2">
                    {missingRequired.map((dep) => {
                        const thumbUrl = dep.mod.thumbnail
                            ? `${THUMBNAIL_BASE_URL}/${dep.mod.thumbnail.file}`
                            : null
                        const isInstalling = installingDeps[dep.mod.id]
                        async function handleInstallDep() {
                            if (!gamePath) return
                            setInstallingDeps((prev) => ({ ...prev, [dep.mod.id]: true }))
                            try {
                                await api.installMod(dep.mod.id, gamePath)
                                await onRefreshInstalled()
                            } finally {
                                setInstallingDeps((prev) => ({ ...prev, [dep.mod.id]: false }))
                            }
                        }
                        return (
                            <div
                                key={dep.id}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover border border-border"
                            >
                                {thumbUrl ? (
                                    <img
                                        src={thumbUrl}
                                        alt={dep.mod.name}
                                        loading="lazy"
                                        className="w-8 h-8 rounded object-cover shrink-0"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded bg-surface-active shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate">
                                        {dep.mod.name}
                                    </div>
                                    <div className="text-xs text-text-subtle">
                                        {t('common.by', { name: dep.mod.user.name })}
                                    </div>
                                </div>
                                {dep.mod.has_download && gamePath && (
                                    <button
                                        disabled={isInstalling}
                                        onClick={handleInstallDep}
                                        className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                    >
                                        {isInstalling
                                            ? t('common.installing')
                                            : t('common.install')}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
                <div className="flex items-center justify-between">
                    <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        onClick={() => setDontShowAgain((v) => !v)}
                    >
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={() => {}}
                            className="accent-accent pointer-events-none"
                        />
                        <span className="text-xs text-text-muted">{t('common.dontShowAgain')}</span>
                    </div>
                    <button
                        onClick={() => onGotIt(dontShowAgain)}
                        className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright transition-colors"
                    >
                        {t('depsWarning.gotIt')}
                    </button>
                </div>
            </div>
        </div>
    )
}
