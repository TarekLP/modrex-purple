import { useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { Button } from '../ui/Button'
import type { Mod, ModDependency, InstalledMod, GameId } from '../../../../shared/types'
import { MarkdownContent } from '../MarkdownContent'
import { Tooltip } from '../Tooltip'
import { t } from '../../i18n'
import { useThumbnail } from '../../hooks/useThumbnail'
import { isLoaderDep, offsiteDepHost } from '../../deps'
import { api } from '../../api'

export function DepsTab({
    mod,
    deps,
    installed,
    gamePath,
    activeGame,
    loaderInstalled,
    loaderModIds,
    onInstallLoader,
    onRefreshInstalled,
    onOpenDetail,
}: {
    mod: Mod
    deps: ModDependency[]
    installed: InstalledMod[]
    gamePath: string | null
    activeGame?: GameId
    loaderInstalled: boolean | null
    // Hosted loaders (PDTHModOverrides, DAHM, UE4SS, RAID-SuperBLT) are on-site deps but aren't
    // tracked in the installed list — their per-id presence state lives here instead.
    loaderModIds: Record<number, boolean | null>
    onInstallLoader?: (modId: number | null) => Promise<void>
    onRefreshInstalled: () => Promise<void>
    onOpenDetail?: (modId: number) => void
}) {
    const hasInstructions = !!(mod.instructs_template?.instructions || mod.instructions)
    const required = deps.filter((d) => !d.optional)
    const optional = deps.filter((d) => d.optional)

    return (
        <div className="flex flex-col gap-8 max-w-3xl">
            {hasInstructions && (
                <section>
                    <h2 className="text-sm font-semibold mb-3 text-text">
                        {t('detail.deps.instructions')}
                    </h2>
                    {mod.instructs_template?.instructions && (
                        <MarkdownContent text={mod.instructs_template.instructions} />
                    )}
                    {mod.instructions && (
                        <div className="mt-3">
                            <MarkdownContent text={mod.instructions} />
                        </div>
                    )}
                </section>
            )}

            {required.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold mb-3 text-text">
                        {t('detail.deps.required')}
                    </h2>
                    <div className="flex flex-col gap-2">
                        {required.map((dep) => (
                            <DepRow
                                key={dep.id}
                                dep={dep}
                                installed={installed}
                                gamePath={gamePath}
                                activeGame={activeGame}
                                loaderInstalled={loaderInstalled}
                                loaderModIds={loaderModIds}
                                onInstallLoader={onInstallLoader}
                                onRefreshInstalled={onRefreshInstalled}
                                onOpenDetail={onOpenDetail}
                            />
                        ))}
                    </div>
                </section>
            )}

            {optional.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold mb-3 text-text">
                        {t('detail.deps.optional')}
                    </h2>
                    <div className="flex flex-col gap-2">
                        {optional.map((dep) => (
                            <DepRow
                                key={dep.id}
                                dep={dep}
                                installed={installed}
                                gamePath={gamePath}
                                activeGame={activeGame}
                                loaderInstalled={loaderInstalled}
                                loaderModIds={loaderModIds}
                                onInstallLoader={onInstallLoader}
                                onRefreshInstalled={onRefreshInstalled}
                                onOpenDetail={onOpenDetail}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function DepRow({
    dep,
    installed,
    gamePath,
    activeGame,
    loaderInstalled,
    loaderModIds,
    onInstallLoader,
    onRefreshInstalled,
    onOpenDetail,
}: {
    dep: ModDependency
    installed: InstalledMod[]
    gamePath: string | null
    activeGame?: GameId
    loaderInstalled: boolean | null
    loaderModIds: Record<number, boolean | null>
    onInstallLoader?: (modId: number | null) => Promise<void>
    onRefreshInstalled: () => Promise<void>
    onOpenDetail?: (modId: number) => void
}) {
    const [installing, setInstalling] = useState(false)
    const thumbSrc = useThumbnail(dep.mod?.thumbnail?.file)
    const { mod } = dep
    if (!mod) {
        if (!dep.url) return null
        const status = isLoaderDep(dep) ? loaderInstalled : null
        const canInstallLoader = status === false && !!gamePath && !!onInstallLoader

        async function handleInstallLoader(e: React.MouseEvent) {
            e.stopPropagation()
            setInstalling(true)
            try {
                await onInstallLoader!(null)
            } finally {
                setInstalling(false)
            }
        }

        return (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-hover border border-border">
                <div className="w-10 h-10 rounded bg-surface-active shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                        {dep.name ?? offsiteDepHost(dep.url)}
                    </div>
                    <div className="text-xs text-text-subtle mt-0.5">
                        {offsiteDepHost(dep.url)}
                        {status !== null && (
                            <>
                                {' · '}
                                <span className={status ? 'text-success-text' : 'text-danger-text'}>
                                    {status
                                        ? t('detail.deps.statusInstalled')
                                        : dep.optional
                                          ? t('detail.deps.statusNotInstalled')
                                          : t('detail.deps.statusMissing')}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                <span
                    className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                        dep.optional
                            ? 'border-surface-light text-text-subtle'
                            : 'border-accent/40 text-accent'
                    }`}
                >
                    {dep.optional ? t('detail.deps.badgeOptional') : t('detail.deps.badgeRequired')}
                </span>
                {canInstallLoader ? (
                    <>
                        <Button
                            variant="accent"
                            size="md"
                            disabled={installing}
                            onClick={handleInstallLoader}
                            className="shrink-0"
                        >
                            {!installing && <Download className="w-3.5 h-3.5" />}
                            {installing ? t('common.installing') : t('common.install')}
                        </Button>
                        <Tooltip content={offsiteDepHost(dep.url)}>
                            <button
                                onClick={() => api.openExternal(dep.url!)}
                                className="p-1.5 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors shrink-0"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                        </Tooltip>
                    </>
                ) : (
                    <Button
                        variant="accent"
                        size="md"
                        onClick={() => api.openExternal(dep.url!)}
                        className="shrink-0"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t('common.openLink')}
                    </Button>
                )}
            </div>
        )
    }
    // Hosted loaders (RAID-SuperBLT, PDTHModOverrides, DAHM, UE4SS) are on-site deps but live in
    // the game root as DLLs, not the installed-mods list — their presence comes from loaderModIds
    // (null = not yet checked). Falling through to the installed-list check would always read
    // "Missing" for an installed loader.
    const isHostedLoader = mod.id in loaderModIds
    const isInstalled = isHostedLoader
        ? loaderModIds[mod.id] === true
        : installed.some((m) => m.id === mod.id)

    async function handleInstall(e: React.MouseEvent) {
        e.stopPropagation()
        if (!gamePath) return
        setInstalling(true)
        try {
            if (isHostedLoader && onInstallLoader) {
                // Loaders install via a dedicated command (extraction to game root/Binaries),
                // never the normal mod-install flow.
                await onInstallLoader(mod!.id)
            } else {
                await api.installMod(mod!.id, gamePath, activeGame)
                await onRefreshInstalled()
            }
        } finally {
            setInstalling(false)
        }
    }

    return (
        <div
            role={onOpenDetail ? 'button' : undefined}
            tabIndex={onOpenDetail ? 0 : undefined}
            onClick={() => onOpenDetail?.(mod.id)}
            onKeyDown={(e) => e.key === 'Enter' && onOpenDetail?.(mod.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-hover border border-border transition-colors ${
                onOpenDetail ? 'cursor-pointer hover:border-accent/50 hover:bg-surface-raised' : ''
            }`}
        >
            {thumbSrc ? (
                <img
                    src={thumbSrc}
                    alt={mod.name}
                    loading="lazy"
                    className="w-10 h-10 rounded object-cover shrink-0"
                />
            ) : (
                <div className="w-10 h-10 rounded bg-surface-active shrink-0" />
            )}
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{mod.name}</div>
                <div className="text-xs text-text-subtle mt-0.5">
                    {t('common.by', { name: mod.user.name })} · {mod.version} ·{' '}
                    <span className={isInstalled ? 'text-success-text' : 'text-danger-text'}>
                        {isInstalled
                            ? t('detail.deps.statusInstalled')
                            : dep.optional
                              ? t('detail.deps.statusNotInstalled')
                              : t('detail.deps.statusMissing')}
                    </span>
                </div>
            </div>
            <span
                className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                    dep.optional
                        ? 'border-surface-light text-text-subtle'
                        : 'border-accent/40 text-accent'
                }`}
            >
                {dep.optional ? t('detail.deps.badgeOptional') : t('detail.deps.badgeRequired')}
            </span>
            {!isInstalled && mod.has_download && !mod.disable_mod_managers && gamePath && (
                <Button
                    variant="accent"
                    size="md"
                    disabled={installing}
                    onClick={handleInstall}
                    className="shrink-0"
                >
                    {!installing && <Download className="w-3.5 h-3.5" />}
                    {installing ? t('common.installing') : t('common.install')}
                </Button>
            )}
            <Tooltip content={t('detail.deps.openOnSite')}>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        api.openExternal(`https://modworkshop.net/mod/${mod.id}`)
                    }}
                    className="p-1.5 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors shrink-0"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                </button>
            </Tooltip>
        </div>
    )
}
