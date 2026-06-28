import { useState, useEffect, useCallback } from 'react'
import { Button } from './ui/Button'
import * as Tabs from '@radix-ui/react-tabs'
import {
    ArrowLeft,
    Trash2,
    Download,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    X,
    AlertTriangle,
} from 'lucide-react'
import { t } from '../i18n'
import { Toggle } from './Toggle'
import { Tooltip } from './Tooltip'
import type {
    GameId,
    Mod,
    ModFile,
    ModLink,
    ModDependency,
    InstalledMod,
} from '../../../shared/types'
import {
    getCachedMod,
    getCachedModFiles,
    getCachedModLinks,
    getModCacheEntry,
    getFilesCacheEntry,
    getLinksCacheEntry,
} from '../modCache'
import { DepsWarningModal } from './DepsWarningModal'
import { FileSelectModal } from './FileSelectModal'
import { NonPakConfirmModal } from './NonPakConfirmModal'
import { ZipPickerModal } from './ZipPickerModal'
import type { ZipMultiPakPayload } from './ZipPickerModal'
import { HostPackModal } from './HostPackModal'
import type { HostPackPayload } from './HostPackModal'
import { UnrecognizedArchiveModal } from './UnrecognizedArchiveModal'
import { CrimeBossFlatArchiveModal } from './CrimeBossFlatArchiveModal'
import type { CbFlatArchivePayload } from './CrimeBossFlatArchiveModal'
import { CrimeBossInstallTargetModal } from './CrimeBossInstallTargetModal'
import { useCrimeBossInstallTarget } from '../hooks/useCrimeBossInstallTarget'
import { isUnsupportedFormat } from '../formatCheck'
import { handleInstallSentinel } from '../installSentinels'
import {
    collectDeps,
    isLoaderDep,
    isUe4ssLoaderId,
    isPdthLoaderId,
    missingRequiredDeps,
    buildLoaderModIds,
    loaderIdsForGame,
    PDTH_OVERRIDES_ID,
    DAHM_ID,
} from '../deps'
import { resolveDepCheck } from '../installDepCheck'
import { useThumbnail } from '../hooks/useThumbnail'
import { api } from '../api'
import { markForegroundActivity } from '../requestPriority'
import { DescriptionTab, ChangelogTab } from './modDetail/textTabs'
import { LightboxImage, ImagesTab } from './modDetail/ImagesTab'
import { DownloadsTab } from './modDetail/DownloadsTab'
import { DepsTab } from './modDetail/DepsTab'
import { formatDate } from './modDetail/format'

type Tab = 'description' | 'images' | 'downloads' | 'changelog' | 'deps'

interface Props {
    modId: number
    initialMod?: Mod
    isActive?: boolean
    gamePath: string | null
    installed: InstalledMod[]
    activeGame?: GameId
    onBack: () => void
    onRefreshInstalled: () => Promise<void>
    onOpenDetail?: (modId: number) => void
}

export function ModDetailPage({
    modId,
    initialMod,
    isActive = true,
    gamePath,
    installed,
    activeGame = 'pd3',
    onBack,
    onRefreshInstalled,
    onOpenDetail,
}: Props) {
    // Seed order: full cached entry > initialMod from browse list > null (shows spinner).
    const [mod, setMod] = useState<Mod | null>(
        () => getModCacheEntry(modId)?.mod ?? initialMod ?? null
    )
    const [files, setFiles] = useState<ModFile[]>(() => getFilesCacheEntry(modId)?.files ?? [])
    const [links, setLinks] = useState<ModLink[]>(() => getLinksCacheEntry(modId)?.links ?? [])
    // Skip full-page spinner when any mod data is available; skip files spinner when files are cached.
    const [loading, setLoading] = useState(() => !getModCacheEntry(modId) && !initialMod)
    const [filesLoading, setFilesLoading] = useState(() => !getFilesCacheEntry(modId))
    const [error, setError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [installError, setInstallError] = useState<string | null>(null)
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
    const [showDepsWarning, setShowDepsWarning] = useState(false)
    const [loaderInstalled, setLoaderInstalled] = useState<boolean | null>(null)
    const [pdthOverridesInstalled, setPdthOverridesInstalled] = useState<boolean | null>(null)
    const [dahmInstalled, setDahmInstalled] = useState<boolean | null>(null)
    const [ue4ssInstalled, setUe4ssInstalled] = useState<boolean | null>(null)
    const [showFileSelect, setShowFileSelect] = useState(false)
    const [showHeaderFormatWarning, setShowHeaderFormatWarning] = useState(false)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)
    const [hostPackData, setHostPackData] = useState<HostPackPayload | null>(null)
    const [unrecognizedModId, setUnrecognizedModId] = useState<number | null>(null)
    const [cbFlatArchiveData, setCbFlatArchiveData] = useState<CbFlatArchivePayload | null>(null)
    const crimeBossInstallTarget = useCrimeBossInstallTarget(
        activeGame,
        gamePath,
        onRefreshInstalled
    )
    const [downloadMap, setDownloadMap] = useState<
        ReadonlyMap<string, { downloaded: number; total: number }>
    >(new Map())

    const installedFiles = installed.filter((m) => m.id === modId)
    const installedMod = installedFiles[0]
    // Not tracked in the installed list — DLL presence drives its button state.
    const isUe4ssMod = isUe4ssLoaderId(activeGame, modId)
    const isLoaderMod = isPdthLoaderId(activeGame, modId) || isUe4ssMod
    const loaderModInstalled =
        modId === PDTH_OVERRIDES_ID
            ? pdthOverridesInstalled
            : modId === DAHM_ID
              ? dahmInstalled
              : isUe4ssMod
                ? ue4ssInstalled
                : null

    // Full-size banner via the disk cache — the CDN sends no cache headers, so a
    // direct URL costs a download or revalidation round-trip on every page visit.
    const bannerSrc = useThumbnail((mod?.banner ?? mod?.thumbnail)?.file, true)

    const fetchData = useCallback(() => {
        setError(null)
        markForegroundActivity()

        // Mod and files/links fetch in parallel; each resolves independently so
        // the header renders as soon as mod data is available.
        getCachedMod(modId)
            .then((modData) => setMod(modData))
            .catch((e) => setError(String(e)))
            .finally(() => {
                setLoading(false)
                markForegroundActivity()
            })

        Promise.all([getCachedModFiles(modId), getCachedModLinks(modId)])
            .then(([filesData, linksData]) => {
                setFiles(filesData)
                setLinks(linksData)
            })
            .catch(() => {})
            .finally(() => {
                setFilesLoading(false)
                markForegroundActivity()
            })
    }, [modId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        return api.onDownloadProgress(({ download_id, downloaded, total }) => {
            setDownloadMap((prev) => new Map(prev).set(download_id, { downloaded, total }))
        })
    }, [])

    const images = mod?.images ?? []

    useEffect(() => {
        if (!isActive) return
        function onKey(e: KeyboardEvent) {
            if (lightboxIndex !== null) {
                if (e.key === 'Escape') setLightboxIndex(null)
                else if (e.key === 'ArrowLeft')
                    setLightboxIndex((i) => (i! > 0 ? i! - 1 : images.length - 1))
                else if (e.key === 'ArrowRight')
                    setLightboxIndex((i) => (i! < images.length - 1 ? i! + 1 : 0))
                return
            }
            if (e.key === 'Escape') onBack()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isActive, lightboxIndex, images.length, onBack])

    async function handleInstall() {
        if (!gamePath || !mod) return
        if (mod.download?.url && !mod.download.download_url) {
            api.openExternal(mod.download.url)
            return
        }
        // Dep check runs here — before FileSelectModal — because multi-file mods
        // (download === null, files.length > 1) go through FileSelectModal which has
        // no dep check of its own, so doInstall is never reached for them.
        let checkedMod = mod
        if (mod.dependencies === undefined) {
            checkedMod = await getCachedMod(modId)
            setMod(checkedMod)
        }
        const depResult = await resolveDepCheck(
            modId,
            checkedMod,
            gamePath,
            activeGame,
            installed,
            {
                loaderInstalled,
                ue4ssInstalled,
                pdthOverridesInstalled,
                dahmInstalled,
            }
        )
        if (depResult) {
            setLoaderInstalled(depResult.loaderState.loaderInstalled)
            setUe4ssInstalled(depResult.loaderState.ue4ssInstalled)
            setPdthOverridesInstalled(depResult.loaderState.pdthOverridesInstalled)
            setDahmInstalled(depResult.loaderState.dahmInstalled)
            setShowDepsWarning(true)
            return
        }
        if (mod.download === null && files.length > 1) {
            setShowFileSelect(true)
            return
        }
        const checkType = mod.download?.type ?? (files.length === 1 ? files[0].type : undefined)
        const checkUrl =
            mod.download?.download_url ?? (files.length === 1 ? files[0].download_url : undefined)
        if (isUnsupportedFormat(checkType, checkUrl)) {
            setShowHeaderFormatWarning(true)
            return
        }
        try {
            await crimeBossInstallTarget.runInstall(mod.id, mod.name, doInstall)
        } catch (e) {
            setInstallError(String(e))
        }
    }

    async function doInstall() {
        if (!gamePath || !mod) return
        setInstallError(null)
        setActionLoading(true)
        try {
            if (activeGame === 'pdth' && mod.id === PDTH_OVERRIDES_ID) {
                await api.installPdthOverrides(gamePath)
                setPdthOverridesInstalled(true)
            } else if (activeGame === 'pdth' && mod.id === DAHM_ID) {
                await api.installDahm(gamePath)
                setDahmInstalled(true)
            } else {
                await api.installMod(mod.id, gamePath, activeGame)
            }
            await onRefreshInstalled()
        } catch (e) {
            const handled = handleInstallSentinel(String(e), {
                onZipMultiPak: setZipPickerData,
                onHostModPack: setHostPackData,
                onCbFlatArchive: setCbFlatArchiveData,
                onUnrecognizedArchive: () => setUnrecognizedModId(mod.id),
            })
            if (!handled) throw e
        } finally {
            setActionLoading(false)
        }
    }

    async function handleInstallLoader(loaderModId: number | null) {
        if (!gamePath) return
        setInstallError(null)
        try {
            if (loaderModId === PDTH_OVERRIDES_ID) {
                await api.installPdthOverrides(gamePath)
                setPdthOverridesInstalled(true)
            } else if (loaderModId === DAHM_ID) {
                await api.installDahm(gamePath)
                setDahmInstalled(true)
            } else if (loaderModId !== null && isUe4ssLoaderId(activeGame, loaderModId)) {
                // UE4SS has no dedicated install command — it's routed server-side via the
                // UE4SS_LOADER sentinel the same way any other mod install resolves.
                await api.installMod(loaderModId, gamePath, activeGame)
                setUe4ssInstalled(true)
            } else {
                await api.installSuperblt(gamePath)
                setLoaderInstalled(true)
            }
        } catch (e) {
            setInstallError(String(e))
        }
    }

    async function handleUninstall() {
        if (!gamePath || installedFiles.length === 0) return
        setActionLoading(true)
        try {
            for (const m of installedFiles) await api.uninstallMod(m.uid, gamePath, activeGame)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    async function handleEnable() {
        if (!gamePath || installedFiles.length === 0) return
        setActionLoading(true)
        try {
            for (const m of installedFiles) await api.enableMod(m.uid, gamePath, activeGame)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    async function handleDisable() {
        if (!gamePath || installedFiles.length === 0) return
        setActionLoading(true)
        try {
            for (const m of installedFiles) await api.disableMod(m.uid, gamePath, activeGame)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    const canAct = !!gamePath && !actionLoading && !loading

    const allDeps: ModDependency[] = collectDeps(mod)

    // Hosted loader mods (PDTHModOverrides, DAHM, UE4SS) install as game-root/Binaries
    // files and are checked by presence, not the installed-mods list.
    const hasLoaderDepBlt = activeGame !== 'pdth' && allDeps.some(isLoaderDep)
    const hasLoaderDepPdthOverrides =
        activeGame === 'pdth' && allDeps.some((d) => d.mod?.id === PDTH_OVERRIDES_ID)
    const hasLoaderDepDahm = activeGame === 'pdth' && allDeps.some((d) => d.mod?.id === DAHM_ID)
    const hasLoaderDepUe4ss = allDeps.some(
        (d) => d.mod !== null && isUe4ssLoaderId(activeGame, d.mod.id)
    )
    const loaderModIds = buildLoaderModIds(activeGame, {
        pdthOverridesInstalled,
        dahmInstalled,
        ue4ssInstalled,
    })
    const missingRequired = missingRequiredDeps(allDeps, installed, loaderInstalled, loaderModIds)

    useEffect(() => {
        if (!gamePath) return
        const needsBlt = hasLoaderDepBlt
        const needsPdthOverrides =
            hasLoaderDepPdthOverrides || (activeGame === 'pdth' && modId === PDTH_OVERRIDES_ID)
        const needsDahm = hasLoaderDepDahm || (activeGame === 'pdth' && modId === DAHM_ID)
        const needsUe4ss = isUe4ssMod || hasLoaderDepUe4ss
        if (!needsBlt && !needsPdthOverrides && !needsDahm && !needsUe4ss) return
        let cancelled = false
        if (needsBlt) {
            api.checkSuperblt(gamePath).then((v) => {
                if (!cancelled) setLoaderInstalled(v)
            })
        }
        if (needsPdthOverrides) {
            api.checkPdthOverrides(gamePath).then((v) => {
                if (!cancelled) setPdthOverridesInstalled(v)
            })
        }
        if (needsDahm) {
            api.checkDahm(gamePath).then((v) => {
                if (!cancelled) setDahmInstalled(v)
            })
        }
        if (needsUe4ss) {
            api.checkUe4ss(gamePath, activeGame).then((v) => {
                if (!cancelled) setUe4ssInstalled(v)
            })
        }
        return () => {
            cancelled = true
        }
    }, [
        gamePath,
        hasLoaderDepBlt,
        hasLoaderDepPdthOverrides,
        hasLoaderDepDahm,
        hasLoaderDepUe4ss,
        isUe4ssMod,
        activeGame,
        modId,
    ])

    const showChangelogTab = !!mod?.changelog
    const showDepsTab =
        !!(mod?.instructs_template?.instructions || mod?.instructions) || allDeps.length > 0

    const tabs: { id: Tab; label: string }[] = [
        { id: 'description', label: t('detail.tabs.description') },
        {
            id: 'images',
            label: mod?.images?.length
                ? t('detail.tabs.imagesCount', { count: mod.images.length })
                : t('detail.tabs.images'),
        },
        {
            id: 'downloads',
            label:
                files.length + links.length
                    ? t('detail.tabs.downloadsCount', { count: files.length + links.length })
                    : t('detail.tabs.downloads'),
        },
        ...(showChangelogTab
            ? [{ id: 'changelog' as Tab, label: t('detail.tabs.changelog') }]
            : []),
        ...(showDepsTab ? [{ id: 'deps' as Tab, label: t('detail.tabs.deps') }] : []),
    ]

    return (
        <div className="h-full flex flex-col">
            {crimeBossInstallTarget.pendingChoice && (
                <CrimeBossInstallTargetModal
                    modName={crimeBossInstallTarget.pendingChoice.modName}
                    busy={crimeBossInstallTarget.relocating}
                    error={crimeBossInstallTarget.error}
                    onChoose={crimeBossInstallTarget.confirmChoice}
                    onCancel={crimeBossInstallTarget.cancelChoice}
                />
            )}
            {zipPickerData && gamePath && (
                <ZipPickerModal
                    payload={zipPickerData}
                    gamePath={gamePath}
                    installedFiles={installedFiles}
                    gameId={activeGame}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setZipPickerData(null)}
                />
            )}
            {hostPackData && gamePath && (
                <HostPackModal
                    payload={hostPackData}
                    gamePath={gamePath}
                    installed={installed}
                    gameId={activeGame}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setHostPackData(null)}
                />
            )}
            {cbFlatArchiveData && gamePath && (
                <CrimeBossFlatArchiveModal
                    payload={cbFlatArchiveData}
                    gamePath={gamePath}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setCbFlatArchiveData(null)}
                />
            )}
            {unrecognizedModId !== null && (
                <UnrecognizedArchiveModal
                    modId={unrecognizedModId}
                    onClose={() => setUnrecognizedModId(null)}
                />
            )}
            {showFileSelect && mod && (
                <FileSelectModal
                    mod={mod}
                    files={files}
                    gamePath={gamePath}
                    installedFiles={installedFiles}
                    gameId={activeGame}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setShowFileSelect(false)}
                />
            )}
            {showHeaderFormatWarning && (
                <NonPakConfirmModal
                    onConfirm={async () => {
                        setShowHeaderFormatWarning(false)
                        try {
                            await crimeBossInstallTarget.runInstall(mod!.id, mod!.name, doInstall)
                        } catch (e) {
                            setInstallError(String(e))
                        }
                    }}
                    onCancel={() => setShowHeaderFormatWarning(false)}
                />
            )}
            {showDepsWarning && (
                <DepsWarningModal
                    modId={modId}
                    missingRequired={missingRequired}
                    gamePath={gamePath}
                    gameId={activeGame}
                    loaderModIds={loaderIdsForGame(activeGame)}
                    onInstallLoader={handleInstallLoader}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setShowDepsWarning(false)}
                    onGotIt={async (permanent) => {
                        sessionStorage.setItem(`depsWarningDismissed-${modId}`, '1')
                        if (permanent) await api.dismissDepsWarning(modId)
                        setShowDepsWarning(false)
                    }}
                />
            )}
            <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-3 relative">
                <button
                    onClick={onBack}
                    className="-mx-2 px-2 py-1 rounded text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors flex items-center gap-1.5 shrink-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('detail.back')}
                </button>
                {mod && (
                    <span className="text-sm text-text-subtle truncate hidden sm:block">
                        {mod.name}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                    {mod && installedMod && !isLoaderMod && (
                        <>
                            <Toggle
                                checked={installedFiles.every((m) => m.enabled)}
                                onChange={(v) => (v ? handleEnable() : handleDisable())}
                                disabled={!canAct}
                            />
                            <Tooltip content={t('common.remove')}>
                                <Button
                                    variant="danger"
                                    size="icon-md"
                                    disabled={!canAct}
                                    onClick={handleUninstall}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </Tooltip>
                        </>
                    )}
                    {mod && isLoaderMod && loaderModInstalled && (
                        <span className="text-xs text-success-text">
                            {t('detail.deps.statusInstalled')}
                        </span>
                    )}
                    {mod && installedFiles.length === 0 && !(isLoaderMod && loaderModInstalled) && (
                        <div className="flex flex-col items-end gap-1">
                            {mod.disable_mod_managers ? (
                                <span className="text-xs text-text-muted">
                                    {t('common.modManagerDisabled')}
                                </span>
                            ) : mod.has_download ? (
                                <>
                                    {mod.download?.url && !mod.download.download_url ? (
                                        <Button
                                            variant="accent"
                                            size="lg"
                                            onClick={() => api.openExternal(mod.download!.url!)}
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            {t('common.openLink')}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="accent"
                                            size="lg"
                                            disabled={!canAct}
                                            onClick={handleInstall}
                                        >
                                            {!actionLoading && <Download className="w-3.5 h-3.5" />}
                                            {actionLoading
                                                ? (() => {
                                                      const p = downloadMap.get(`mod:${modId}`)
                                                      return p
                                                          ? p.total > 0
                                                              ? `${Math.round((p.downloaded / p.total) * 100)}%`
                                                              : t('common.downloading')
                                                          : t('common.installing')
                                                  })()
                                                : t('common.install')}
                                        </Button>
                                    )}
                                    {isUnsupportedFormat(
                                        mod.download?.type,
                                        mod.download?.download_url
                                    ) && (
                                        <span className="flex items-center gap-1 text-xs text-warning">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            {t('common.nonPakWarning')}
                                        </span>
                                    )}
                                </>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
            {(() => {
                const p = downloadMap.get(`mod:${modId}`)
                return p ? (
                    <div className="h-0.5 bg-surface-active shrink-0">
                        {p.total > 0 ? (
                            <div
                                className="h-full bg-accent transition-[width] duration-100"
                                style={{
                                    width: `${Math.round((p.downloaded / p.total) * 100)}%`,
                                }}
                            />
                        ) : (
                            <div className="h-full bg-accent animate-pulse w-full" />
                        )}
                    </div>
                ) : null
            })()}

            {installError && (
                <div className="px-6 py-2 bg-danger/20 border-b border-danger/30 text-xs text-danger-text flex items-center justify-between shrink-0">
                    <span>{installError}</span>
                    <button
                        onClick={() => setInstallError(null)}
                        className="ml-2 shrink-0 p-1 rounded text-danger-text/70 hover:text-danger-text hover:bg-danger/20 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center flex-1 text-text-subtle text-sm">
                    {t('common.loading')}
                </div>
            )}

            {error && (
                <div className="flex items-center justify-center flex-1">
                    <div className="text-sm text-danger-text">{error}</div>
                </div>
            )}

            {!loading && !error && mod && (
                <div className="flex-1 overflow-y-auto">
                    {(mod.banner ?? mod.thumbnail) &&
                        (bannerSrc ? (
                            <img
                                src={bannerSrc}
                                alt={mod.name}
                                loading="lazy"
                                className="w-full h-48 object-cover"
                            />
                        ) : (
                            <div className="w-full h-48 bg-surface-raised" />
                        ))}

                    <div className="px-6 py-5 border-b border-border">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h1 className="text-xl font-bold leading-tight">{mod.name}</h1>
                                <p className="text-sm text-text-muted mt-1">
                                    by {mod.user.name}
                                    {mod.repo_url && (
                                        <>
                                            {' · '}
                                            <button
                                                onClick={() => api.openExternal(mod.repo_url!)}
                                                className="text-accent-bright hover:underline inline-flex items-center gap-0.5"
                                            >
                                                {t('detail.source')}
                                                <ExternalLink className="w-3 h-3" />
                                            </button>
                                        </>
                                    )}
                                    {mod.id > 0 && (
                                        <>
                                            {' · '}
                                            <button
                                                onClick={() =>
                                                    api.openExternal(
                                                        `https://modworkshop.net/mod/${mod.id}`
                                                    )
                                                }
                                                className="text-accent-bright hover:underline inline-flex items-center gap-0.5"
                                            >
                                                {t('detail.viewOnSite')}
                                                <ExternalLink className="w-3 h-3" />
                                            </button>
                                        </>
                                    )}
                                </p>
                                {mod.tags && mod.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {mod.tags.map((tag) => (
                                            <span
                                                key={tag.id}
                                                className="text-xs px-2 py-0.5 rounded-full border"
                                                style={{
                                                    borderColor: tag.color + '80',
                                                    color: tag.color,
                                                    backgroundColor: tag.color + '18',
                                                }}
                                            >
                                                {tag.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="text-right text-xs text-text-subtle shrink-0">
                                <div className="font-medium text-sm text-text">
                                    {installedMod?.version ?? mod.version}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-5 mt-4 text-sm">
                            <Stat
                                value={mod.downloads.toLocaleString()}
                                label={t('detail.stats.downloads')}
                            />
                            <div className="w-px h-7 bg-border" />
                            <Stat
                                value={mod.likes.toLocaleString()}
                                label={t('detail.stats.likes')}
                            />
                            <div className="w-px h-7 bg-border" />
                            <Stat
                                value={mod.views.toLocaleString()}
                                label={t('detail.stats.views')}
                            />
                            <div className="ml-auto text-xs text-text-subtle text-right">
                                <div>
                                    {t('detail.stats.published', {
                                        date: formatDate(mod.published_at),
                                    })}
                                </div>
                                <div>
                                    {t('detail.stats.updated', { date: formatDate(mod.bumped_at) })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <Tabs.Root defaultValue="description">
                        <Tabs.List className="flex border-b border-border px-6">
                            {tabs.map((tabItem) => (
                                <Tabs.Trigger
                                    key={tabItem.id}
                                    value={tabItem.id}
                                    className="relative text-xs px-4 py-3 border-b-2 border-transparent transition-colors text-text-subtle hover:text-text-muted before:content-[''] before:absolute before:inset-x-1 before:inset-y-1.5 before:rounded before:transition-colors hover:before:bg-surface-hover data-[state=active]:border-accent data-[state=active]:text-accent focus:outline-none"
                                >
                                    <span className="relative">{tabItem.label}</span>
                                </Tabs.Trigger>
                            ))}
                        </Tabs.List>

                        <Tabs.Content value="description" className="px-6 py-5 focus:outline-none">
                            <DescriptionTab mod={mod} />
                        </Tabs.Content>
                        <Tabs.Content value="changelog" className="px-6 py-5 focus:outline-none">
                            <ChangelogTab mod={mod} />
                        </Tabs.Content>
                        <Tabs.Content value="images" className="px-6 py-5 focus:outline-none">
                            <ImagesTab mod={mod} onOpenImage={setLightboxIndex} />
                        </Tabs.Content>
                        <Tabs.Content value="downloads" className="px-6 py-5 focus:outline-none">
                            <DownloadsTab
                                files={files}
                                links={links}
                                loading={filesLoading}
                                mod={mod}
                                gamePath={gamePath}
                                installed={installed}
                                installedFiles={installedFiles}
                                downloadMap={downloadMap}
                                activeGame={activeGame}
                                onRefreshInstalled={onRefreshInstalled}
                            />
                        </Tabs.Content>
                        <Tabs.Content value="deps" className="px-6 py-5 focus:outline-none">
                            <DepsTab
                                mod={mod}
                                deps={allDeps}
                                installed={installed}
                                gamePath={gamePath}
                                activeGame={activeGame}
                                loaderInstalled={loaderInstalled}
                                onInstallLoader={handleInstallLoader}
                                onRefreshInstalled={onRefreshInstalled}
                                onOpenDetail={onOpenDetail}
                            />
                        </Tabs.Content>
                    </Tabs.Root>
                </div>
            )}

            {lightboxIndex !== null && images.length > 0 && (
                <div
                    className="absolute inset-0 bg-black/90 flex items-center justify-center z-50"
                    onClick={() => setLightboxIndex(null)}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setLightboxIndex((i) => (i! > 0 ? i! - 1 : images.length - 1))
                        }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>

                    <LightboxImage file={images[lightboxIndex].file} />

                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setLightboxIndex((i) => (i! < images.length - 1 ? i! + 1 : 0))
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>

                    <button
                        onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 p-1 rounded-full text-white/70 hover:text-white hover:bg-black/40 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    {images.length > 1 && (
                        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60">
                            {lightboxIndex + 1} / {images.length}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <span className="font-semibold">{value}</span>
            <span className="text-xs text-text-subtle">{label}</span>
        </div>
    )
}
