import { useState, useEffect, useCallback, useRef } from 'react'
import {
    ArrowLeft,
    Trash2,
    Download,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    X,
    Tag,
    Clock,
    AlertTriangle,
} from 'lucide-react'
import { t } from '../i18n'
import { Toggle } from './Toggle'
import type { Mod, ModFile, ModLink, ModDependency, InstalledMod } from '../../../shared/types'
import { MarkdownContent } from './MarkdownContent'
import { getCachedMod, getCachedModFiles, getCachedModLinks } from '../modCache'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { DepsWarningModal } from './DepsWarningModal'
import { FileSelectModal } from './FileSelectModal'
import { NonPakConfirmModal } from './NonPakConfirmModal'
import { ZipPickerModal, parseZipMultiPak } from './ZipPickerModal'
import type { ZipMultiPakPayload } from './ZipPickerModal'
import { isUnsupportedFormat } from '../formatCheck'
import { api } from '../api'

type Tab = 'description' | 'images' | 'downloads' | 'changelog' | 'deps'

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${parseFloat((bytes / 1024 / 1024).toFixed(1))} MB`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

interface Props {
    modId: number
    isActive?: boolean
    gamePath: string | null
    installed: InstalledMod[]
    onBack: () => void
    onRefreshInstalled: () => Promise<void>
    onOpenDetail?: (modId: number) => void
}

export function ModDetailPage({
    modId,
    isActive = true,
    gamePath,
    installed,
    onBack,
    onRefreshInstalled,
    onOpenDetail,
}: Props) {
    const [mod, setMod] = useState<Mod | null>(null)
    const [files, setFiles] = useState<ModFile[]>([])
    const [links, setLinks] = useState<ModLink[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tab, setTab] = useState<Tab>('description')
    const [actionLoading, setActionLoading] = useState(false)
    const [installError, setInstallError] = useState<string | null>(null)
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
    const [showDepsWarning, setShowDepsWarning] = useState(false)
    const [showFileSelect, setShowFileSelect] = useState(false)
    const [showHeaderFormatWarning, setShowHeaderFormatWarning] = useState(false)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const progressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const installedFiles = installed.filter((m) => m.id === modId)
    const installedMod = installedFiles[0]

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [modData, files, links] = await Promise.all([
                getCachedMod(modId),
                getCachedModFiles(modId),
                getCachedModLinks(modId),
            ])
            setMod(modData)
            setFiles(files)
            setLinks(links)
        } catch (e) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }, [modId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (!isActive) return
        return api.onDownloadProgress(({ downloaded, total }) => {
            setDownloadProgress({ downloaded, total })
            if (progressClearTimer.current) clearTimeout(progressClearTimer.current)
            progressClearTimer.current = setTimeout(() => setDownloadProgress(null), 800)
        })
    }, [isActive])

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
            } else if (e.key === 'Escape') {
                onBack()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isActive, lightboxIndex, images.length, onBack])

    async function handleInstall() {
        if (!gamePath || !mod) return
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
            await doInstall()
        } catch (e) {
            setInstallError(String(e))
        }
    }

    async function doInstall() {
        if (!gamePath || !mod) return
        if (missingRequired.length > 0) {
            if (!sessionStorage.getItem(`depsWarningDismissed-${modId}`)) {
                const s = await api.getSettings()
                if (!s.dismissedDepsWarnings?.includes(modId)) {
                    setShowDepsWarning(true)
                    return
                }
            }
        }
        setInstallError(null)
        setActionLoading(true)
        try {
            await api.installMod(mod.id, gamePath)
            await onRefreshInstalled()
        } catch (e) {
            const zipData = parseZipMultiPak(String(e))
            if (zipData) {
                setZipPickerData(zipData)
            } else {
                throw e
            }
        } finally {
            setActionLoading(false)
        }
    }

    async function handleUninstall() {
        if (!gamePath || installedFiles.length === 0) return
        setActionLoading(true)
        try {
            for (const m of installedFiles) await api.uninstallMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    async function handleEnable() {
        if (!gamePath || installedFiles.length === 0) return
        setActionLoading(true)
        try {
            for (const m of installedFiles) await api.enableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    async function handleDisable() {
        if (!gamePath || installedFiles.length === 0) return
        setActionLoading(true)
        try {
            for (const m of installedFiles) await api.disableMod(m.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    const canAct = !!gamePath && !actionLoading && !loading

    const allDeps: ModDependency[] = [
        ...(mod?.dependencies ?? []),
        ...(mod?.instructs_template?.dependencies ?? []),
    ].filter((d) => d.mod !== null)

    const missingRequired = allDeps.filter(
        (d) => !d.optional && d.mod !== null && !installed.some((m) => m.id === d.mod!.id)
    )

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
            {zipPickerData && gamePath && (
                <ZipPickerModal
                    payload={zipPickerData}
                    gamePath={gamePath}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setZipPickerData(null)}
                />
            )}
            {showFileSelect && mod && (
                <FileSelectModal
                    mod={mod}
                    files={files}
                    gamePath={gamePath}
                    installedFiles={installedFiles}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setShowFileSelect(false)}
                />
            )}
            {showHeaderFormatWarning && (
                <NonPakConfirmModal
                    onConfirm={async () => {
                        setShowHeaderFormatWarning(false)
                        try {
                            await doInstall()
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
                    className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1.5 shrink-0"
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
                    {mod && installedMod && (
                        <>
                            <Toggle
                                checked={installedFiles.every((m) => m.enabled)}
                                onChange={(v) => (v ? handleEnable() : handleDisable())}
                                disabled={!canAct}
                            />
                            <button
                                disabled={!canAct}
                                onClick={handleUninstall}
                                title={t('common.remove')}
                                className="p-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    {mod && installedFiles.length === 0 && (
                        <div className="flex flex-col items-end gap-1">
                            {mod.disable_mod_managers ? (
                                <span className="text-xs text-text-muted">
                                    {t('common.modManagerDisabled')}
                                </span>
                            ) : mod.has_download ? (
                                <>
                                    {mod.download?.url && !mod.download.download_url ? (
                                        <button
                                            onClick={() => api.openExternal(mod.download!.url!)}
                                            className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright transition-colors flex items-center gap-1.5"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            {t('common.openLink')}
                                        </button>
                                    ) : (
                                        <button
                                            disabled={!canAct}
                                            onClick={handleInstall}
                                            className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                                        >
                                            {!actionLoading && <Download className="w-3.5 h-3.5" />}
                                            {actionLoading
                                                ? downloadProgress
                                                    ? downloadProgress.total > 0
                                                        ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                        : t('common.downloading')
                                                    : t('common.installing')
                                                : t('common.install')}
                                        </button>
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
            {downloadProgress !== null && (
                <div className="h-0.5 bg-surface-active shrink-0">
                    {downloadProgress.total > 0 ? (
                        <div
                            className="h-full bg-accent transition-[width] duration-100"
                            style={{
                                width: `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`,
                            }}
                        />
                    ) : (
                        <div className="h-full bg-accent animate-pulse w-full" />
                    )}
                </div>
            )}

            {installError && (
                <div className="px-6 py-2 bg-danger/20 border-b border-danger/30 text-xs text-danger-text flex items-center justify-between shrink-0">
                    <span>{installError}</span>
                    <button
                        onClick={() => setInstallError(null)}
                        className="ml-2 shrink-0 text-danger-text/70 hover:text-danger-text transition-colors"
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
                    {(mod.banner ?? mod.thumbnail) && (
                        <img
                            src={`${THUMBNAIL_BASE_URL}/${(mod.banner ?? mod.thumbnail)!.file}`}
                            alt={mod.name}
                            loading="lazy"
                            className="w-full h-48 object-cover"
                        />
                    )}

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

                    <div className="flex border-b border-border px-6">
                        {tabs.map((tabItem) => (
                            <button
                                key={tabItem.id}
                                onClick={() => setTab(tabItem.id)}
                                className={`text-xs px-4 py-3 border-b-2 transition-colors ${
                                    tab === tabItem.id
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-text-subtle hover:text-text-muted'
                                }`}
                            >
                                {tabItem.label}
                            </button>
                        ))}
                    </div>

                    <div className="px-6 py-5">
                        {tab === 'description' && <DescriptionTab mod={mod} />}
                        {tab === 'changelog' && <ChangelogTab mod={mod} />}
                        {tab === 'images' && <ImagesTab mod={mod} onOpenImage={setLightboxIndex} />}
                        {tab === 'downloads' && (
                            <DownloadsTab
                                files={files}
                                links={links}
                                mod={mod}
                                gamePath={gamePath}
                                installedFiles={installedFiles}
                                downloadProgress={downloadProgress}
                                onRefreshInstalled={onRefreshInstalled}
                            />
                        )}
                        {tab === 'deps' && (
                            <DepsTab
                                mod={mod}
                                deps={allDeps}
                                installed={installed}
                                gamePath={gamePath}
                                onRefreshInstalled={onRefreshInstalled}
                                onOpenDetail={onOpenDetail}
                            />
                        )}
                    </div>
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

                    <img
                        src={`${THUMBNAIL_BASE_URL}/${images[lightboxIndex].file}`}
                        alt=""
                        className="max-w-[calc(100%-8rem)] max-h-[calc(100%-6rem)] object-contain rounded"
                        onClick={(e) => e.stopPropagation()}
                    />

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
                        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
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

function DescriptionTab({ mod }: { mod: Mod }) {
    return (
        <div className="flex flex-col gap-6 max-w-3xl">
            {mod.desc ? (
                <section>
                    <MarkdownContent text={mod.desc} />
                </section>
            ) : (
                <p className="text-sm text-text-subtle">{t('detail.description.noDescription')}</p>
            )}

            {mod.license && (
                <section>
                    <h2 className="text-sm font-semibold mb-2 text-text">
                        {t('detail.description.license')}
                    </h2>
                    <p className="text-sm text-text-muted">{mod.license}</p>
                </section>
            )}
        </div>
    )
}

function ChangelogTab({ mod }: { mod: Mod }) {
    return (
        <div className="max-w-3xl">
            <MarkdownContent text={mod.changelog!} />
        </div>
    )
}

function ImagesTab({ mod, onOpenImage }: { mod: Mod; onOpenImage: (index: number) => void }) {
    const images = mod.images ?? []
    if (images.length === 0) {
        return <p className="text-sm text-text-subtle">{t('detail.images.none')}</p>
    }
    return (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {images.map((img, i) => (
                <button
                    key={img.id}
                    onClick={() => onOpenImage(i)}
                    className="rounded-lg overflow-hidden border border-border hover:border-accent transition-colors focus:outline-none"
                >
                    <img
                        src={`${THUMBNAIL_BASE_URL}/${img.file}`}
                        alt=""
                        loading="lazy"
                        className="w-full h-40 object-cover"
                    />
                </button>
            ))}
        </div>
    )
}

function DownloadsTab({
    files,
    links,
    mod,
    gamePath,
    installedFiles,
    downloadProgress,
    onRefreshInstalled,
}: {
    files: ModFile[]
    links: ModLink[]
    mod: Mod
    gamePath: string | null
    installedFiles: InstalledMod[]
    downloadProgress: { downloaded: number; total: number } | null
    onRefreshInstalled: () => Promise<void>
}) {
    const [installingId, setInstallingId] = useState<number | null>(null)
    const [uninstallingId, setUninstallingId] = useState<number | null>(null)
    const [installError, setInstallError] = useState<string | null>(null)
    const [formatWarningFile, setFormatWarningFile] = useState<ModFile | null>(null)
    const [zipPickerData, setZipPickerData] = useState<ZipMultiPakPayload | null>(null)

    async function handleUninstallFile(file: ModFile) {
        if (!gamePath) return
        const installedMod = installedFiles.find((m) => m.fileId === file.id)
        if (!installedMod) return
        setUninstallingId(file.id)
        try {
            await api.uninstallMod(installedMod.uid, gamePath)
            await onRefreshInstalled()
        } finally {
            setUninstallingId(null)
        }
    }

    function handleInstallFile(file: ModFile) {
        if (isUnsupportedFormat(file.type, file.download_url)) {
            setFormatWarningFile(file)
            return
        }
        doInstallFile(file)
    }

    async function doInstallFile(file: ModFile) {
        if (!gamePath) return
        setInstallingId(file.id)
        setInstallError(null)
        try {
            await api.installModFile(
                mod.id,
                mod.name,
                file.id,
                file.download_url,
                file.type ?? '',
                mod.version,
                gamePath
            )
            await onRefreshInstalled()
        } catch (e) {
            const errStr = String(e)
            const zipData = parseZipMultiPak(errStr)
            if (zipData) {
                setZipPickerData(zipData)
            } else {
                setInstallError(errStr)
            }
        } finally {
            setInstallingId(null)
        }
    }

    if (files.length === 0 && links.length === 0) {
        return <p className="text-sm text-text-subtle">{t('detail.downloads.none')}</p>
    }

    const modThumbUrl = mod.thumbnail ? `${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}` : null
    const imageMap = new Map((mod.images ?? []).map((img) => [img.id, img]))

    return (
        <div className="flex flex-col gap-3">
            {zipPickerData && gamePath && (
                <ZipPickerModal
                    payload={zipPickerData}
                    gamePath={gamePath}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setZipPickerData(null)}
                />
            )}
            {formatWarningFile && (
                <NonPakConfirmModal
                    onConfirm={() => {
                        const file = formatWarningFile!
                        setFormatWarningFile(null)
                        doInstallFile(file)
                    }}
                    onCancel={() => setFormatWarningFile(null)}
                />
            )}
            {installError && (
                <div className="px-4 py-3 rounded-lg bg-danger/30 border border-danger-hover text-sm text-danger-text">
                    {installError}
                </div>
            )}
            {files.map((file) => {
                const isInstalled = installedFiles.some((m) => m.fileId === file.id)
                const isInstalling = installingId === file.id
                const isUninstalling = uninstallingId === file.id
                const fileImage = file.image_id != null ? imageMap.get(file.image_id) : undefined
                const thumbUrl = fileImage ? `${THUMBNAIL_BASE_URL}/${fileImage.file}` : modThumbUrl
                return (
                    <div
                        key={file.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover border border-border"
                    >
                        <div className="relative shrink-0">
                            {thumbUrl ? (
                                <img
                                    src={thumbUrl}
                                    alt=""
                                    className="w-14 h-14 rounded-lg object-cover"
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-lg bg-surface-active" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                {file.label && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-medium uppercase tracking-wide shrink-0">
                                        {file.label}
                                    </span>
                                )}
                                <span className="text-sm font-semibold truncate">{file.name}</span>
                            </div>
                            {file.desc && (
                                <div className="text-xs text-text-muted mt-1 [&_a]:text-accent-bright [&_a]:hover:underline">
                                    <MarkdownContent text={file.desc} />
                                </div>
                            )}
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-text-subtle">
                                {isUnsupportedFormat(file.type, file.download_url) && (
                                    <span className="flex items-center gap-1 text-warning">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        {t('common.nonPakWarning')}
                                    </span>
                                )}
                                {file.version && (
                                    <span className="flex items-center gap-1">
                                        <Tag className="w-3 h-3 shrink-0" />
                                        {file.version}
                                    </span>
                                )}
                                {file.downloads != null && (
                                    <span className="flex items-center gap-1">
                                        <Download className="w-3 h-3 shrink-0" />
                                        {file.downloads.toLocaleString()}
                                    </span>
                                )}
                                {file.created_at && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 shrink-0" />
                                        {formatDate(file.created_at)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {file.url && !file.download_url ? (
                                <button
                                    onClick={() => api.openExternal(file.url!)}
                                    className="text-xs px-4 py-2 rounded-lg bg-accent hover:bg-accent-bright transition-colors flex items-center gap-1.5"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    {t('common.openLink')}
                                </button>
                            ) : (
                                <>
                                    <button
                                        disabled={
                                            !gamePath ||
                                            isInstalling ||
                                            isInstalled ||
                                            !!mod.disable_mod_managers
                                        }
                                        onClick={() => handleInstallFile(file)}
                                        className={`text-xs px-4 py-2 rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-1.5 ${
                                            isInstalled
                                                ? 'bg-success/20 border border-success/40 text-success-text'
                                                : 'bg-accent hover:bg-accent-bright disabled:opacity-40'
                                        }`}
                                    >
                                        {!isInstalling && !isInstalled && (
                                            <Download className="w-3.5 h-3.5" />
                                        )}
                                        {isInstalling
                                            ? downloadProgress
                                                ? downloadProgress.total > 0
                                                    ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                    : t('common.downloading')
                                                : t('common.installing')
                                            : isInstalled
                                              ? t('common.installed')
                                              : `${t('common.install')}${file.type ? ` ${file.type.toUpperCase()}` : ''} (${formatBytes(file.size)})`}
                                    </button>
                                    {isInstalled && (
                                        <button
                                            disabled={!gamePath || isUninstalling}
                                            onClick={() => handleUninstallFile(file)}
                                            title={t('common.remove')}
                                            className="p-2 rounded-lg bg-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() =>
                                            api.openExternal(file.url ?? file.download_url)
                                        }
                                        title={t('detail.downloads.external')}
                                        className="p-2 rounded-lg bg-surface-active hover:bg-surface-light transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )
            })}
            {links.length > 0 && (
                <>
                    {files.length > 0 && <hr className="border-border" />}
                    {links.map((link) => {
                        const linkImage =
                            link.image_id != null ? imageMap.get(link.image_id) : undefined
                        const thumbUrl = linkImage
                            ? `${THUMBNAIL_BASE_URL}/${linkImage.file}`
                            : modThumbUrl
                        return (
                            <div
                                key={link.id}
                                className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover border border-border"
                            >
                                <div className="relative shrink-0">
                                    {thumbUrl ? (
                                        <img
                                            src={thumbUrl}
                                            alt=""
                                            className="w-14 h-14 rounded-lg object-cover"
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-lg bg-surface-active" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm font-semibold truncate block">
                                        {link.name}
                                    </span>
                                    {link.desc && (
                                        <div className="text-xs text-text-muted mt-1 [&_a]:text-accent-bright [&_a]:hover:underline">
                                            <MarkdownContent text={link.desc} />
                                        </div>
                                    )}
                                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-text-subtle">
                                        {link.version && (
                                            <span className="flex items-center gap-1">
                                                <Tag className="w-3 h-3 shrink-0" />
                                                {link.version}
                                            </span>
                                        )}
                                        {link.downloads != null && (
                                            <span className="flex items-center gap-1">
                                                <Download className="w-3 h-3 shrink-0" />
                                                {link.downloads.toLocaleString()}
                                            </span>
                                        )}
                                        {link.created_at && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3 shrink-0" />
                                                {formatDate(link.created_at)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => api.openExternal(link.url)}
                                    className="text-xs px-4 py-2 rounded-lg bg-accent hover:bg-accent-bright transition-colors flex items-center gap-1.5 shrink-0"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    {t('common.openLink')}
                                </button>
                            </div>
                        )
                    })}
                </>
            )}
        </div>
    )
}

function DepsTab({
    mod,
    deps,
    installed,
    gamePath,
    onRefreshInstalled,
    onOpenDetail,
}: {
    mod: Mod
    deps: ModDependency[]
    installed: InstalledMod[]
    gamePath: string | null
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
    onRefreshInstalled,
    onOpenDetail,
}: {
    dep: ModDependency
    installed: InstalledMod[]
    gamePath: string | null
    onRefreshInstalled: () => Promise<void>
    onOpenDetail?: (modId: number) => void
}) {
    const [installing, setInstalling] = useState(false)
    const { mod } = dep
    if (!mod) return null
    const thumbUrl = mod.thumbnail ? `${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}` : null
    const isInstalled = installed.some((m) => m.id === mod.id)

    async function handleInstall(e: React.MouseEvent) {
        e.stopPropagation()
        if (!gamePath) return
        setInstalling(true)
        try {
            await api.installMod(mod!.id, gamePath)
            await onRefreshInstalled()
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
            {thumbUrl ? (
                <img
                    src={thumbUrl}
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
                    {t('common.by', { name: mod.user.name })} · v{mod.version} ·{' '}
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
                <button
                    disabled={installing}
                    onClick={handleInstall}
                    className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-1.5"
                >
                    {!installing && <Download className="w-3.5 h-3.5" />}
                    {installing ? t('common.installing') : t('common.install')}
                </button>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    api.openExternal(`https://modworkshop.net/mod/${mod.id}`)
                }}
                title={t('detail.deps.openOnSite')}
                className="p-1.5 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors shrink-0"
            >
                <ExternalLink className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}
