import { useState, useEffect } from 'react'
import { X, TriangleAlert, ExternalLink } from 'lucide-react'
import type { ModDependency } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import { api } from '../api'
import { getCachedMod } from '../modCache'
import { isLoaderDep, offsiteDepHost } from '../deps'

interface Props {
    modId: number
    missingRequired: ModDependency[]
    gamePath: string | null
    gameId?: string
    loaderModId?: number | null
    onInstallLoader?: () => Promise<void>
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
    onGotIt: (permanent: boolean) => void
}

export function DepsWarningModal({
    missingRequired,
    gamePath,
    gameId,
    loaderModId,
    onInstallLoader,
    onRefreshInstalled,
    onClose,
    onGotIt,
}: Props) {
    const [dontShowAgain, setDontShowAgain] = useState(false)
    const [installingDeps, setInstallingDeps] = useState<Record<number, boolean>>({})
    const [installingLoader, setInstallingLoader] = useState(false)

    async function handleInstallLoader() {
        if (!onInstallLoader) return
        setInstallingLoader(true)
        try {
            await onInstallLoader()
        } finally {
            setInstallingLoader(false)
        }
    }

    useEffect(() => {
        if (missingRequired.length === 0) onClose()
    }, [missingRequired.length, onClose])

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && onClose()}
            title={t('depsWarning.title')}
            className="w-[480px]"
        >
            <div className="p-6 flex flex-col gap-4">
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
                    {missingRequired
                        .filter((dep) => dep.mod === null && !!dep.url)
                        .map((dep) => (
                            <div
                                key={dep.id}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover border border-border"
                            >
                                <div className="w-8 h-8 rounded bg-surface-active shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate">
                                        {dep.name ?? offsiteDepHost(dep.url!)}
                                    </div>
                                    <div className="text-xs text-text-subtle">
                                        {offsiteDepHost(dep.url!)}
                                    </div>
                                </div>
                                {isLoaderDep(dep) && gamePath && onInstallLoader ? (
                                    <button
                                        disabled={installingLoader}
                                        onClick={handleInstallLoader}
                                        className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                    >
                                        {installingLoader
                                            ? t('common.installing')
                                            : t('common.install')}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => api.openExternal(dep.url!)}
                                        className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright transition-colors shrink-0 flex items-center gap-1.5"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        {t('common.openLink')}
                                    </button>
                                )}
                            </div>
                        ))}
                    {missingRequired
                        .filter((dep) => dep.mod !== null)
                        .map((dep) => {
                            const isLoaderMod = loaderModId != null && dep.mod!.id === loaderModId
                            const thumbUrl = dep.mod!.thumbnail
                                ? `${THUMBNAIL_BASE_URL}/${dep.mod!.thumbnail.file}`
                                : null
                            const isInstalling = isLoaderMod
                                ? installingLoader
                                : installingDeps[dep.mod!.id]
                            async function handleInstallDep() {
                                if (!gamePath) return
                                if (isLoaderMod) {
                                    return handleInstallLoader()
                                }
                                setInstallingDeps((prev) => ({ ...prev, [dep.mod!.id]: true }))
                                try {
                                    const fullMod = await getCachedMod(dep.mod!.id)
                                    if (fullMod.download?.url && !fullMod.download.download_url) {
                                        api.openExternal(fullMod.download.url)
                                        return
                                    }
                                    await api.installMod(dep.mod!.id, gamePath, gameId)
                                    await onRefreshInstalled()
                                } finally {
                                    setInstallingDeps((prev) => ({
                                        ...prev,
                                        [dep.mod!.id]: false,
                                    }))
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
                                            alt={dep.mod!.name}
                                            loading="lazy"
                                            className="w-8 h-8 rounded object-cover shrink-0"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded bg-surface-active shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium truncate">
                                            {dep.mod!.name}
                                        </div>
                                        <div className="text-xs text-text-subtle">
                                            {t('common.by', { name: dep.mod!.user.name })}
                                        </div>
                                    </div>
                                    {dep.mod!.has_download && gamePath && (
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
        </Dialog>
    )
}
