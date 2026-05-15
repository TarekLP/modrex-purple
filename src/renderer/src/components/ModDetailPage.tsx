import { useState, useEffect, useCallback, useRef } from 'react'
import {
    ArrowLeft,
    Trash2,
    Download,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    X,
} from 'lucide-react'
import { Toggle } from './Toggle'
import ReactMarkdown from 'react-markdown'
import type { Mod, ModFile, ModDependency, InstalledMod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { DepsWarningModal } from './DepsWarningModal'
import { FileSelectModal } from './FileSelectModal'

type Tab = 'description' | 'images' | 'downloads' | 'deps'

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function MarkdownContent({ text }: { text: string }) {
    return (
        <ReactMarkdown
            components={{
                p: ({ children }) => (
                    <p className="text-sm text-text-muted leading-relaxed mb-2">{children}</p>
                ),
                h1: ({ children }) => (
                    <h1 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h1>
                ),
                h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h2>
                ),
                h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h3>
                ),
                h4: ({ children }) => (
                    <h4 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h4>
                ),
                ul: ({ children }) => (
                    <ul className="list-disc ml-5 mb-2 text-sm text-text-muted">{children}</ul>
                ),
                ol: ({ children }) => (
                    <ol className="list-decimal ml-5 mb-2 text-sm text-text-muted">{children}</ol>
                ),
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                a: ({ href, children }) => (
                    <a
                        onClick={(e) => {
                            e.preventDefault()
                            href && window.api.openExternal(href)
                        }}
                        className="text-accent-bright underline cursor-pointer"
                    >
                        {children}
                    </a>
                ),
                strong: ({ children }) => (
                    <strong className="font-semibold text-text">{children}</strong>
                ),
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children }) => (
                    <code className="font-mono text-[0.85em] bg-surface-hover px-1 py-0.5 rounded">
                        {children}
                    </code>
                ),
                img: ({ src, alt }) => (
                    <img src={src} alt={alt} className="max-w-full rounded my-2" />
                ),
                hr: () => <hr className="border-none border-t border-border my-3" />,
            }}
        >
            {text}
        </ReactMarkdown>
    )
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
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tab, setTab] = useState<Tab>('description')
    const [actionLoading, setActionLoading] = useState(false)
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
    const [showDepsWarning, setShowDepsWarning] = useState(false)
    const [showFileSelect, setShowFileSelect] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const progressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const installedMod = installed.find((m) => m.id === modId)

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [modData, filesData] = await Promise.all([
                window.api.getMod(modId),
                window.api.listModFiles(modId),
            ])
            setMod(modData)
            setFiles(filesData.data)
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
        return window.api.onDownloadProgress(({ downloaded, total }) => {
            setDownloadProgress({ downloaded, total })
            if (progressClearTimer.current) clearTimeout(progressClearTimer.current)
            progressClearTimer.current = setTimeout(() => setDownloadProgress(null), 800)
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
        if (missingRequired.length > 0) {
            if (!sessionStorage.getItem(`depsWarningDismissed-${modId}`)) {
                const s = await window.api.getSettings()
                if (!s.dismissedDepsWarnings?.includes(modId)) {
                    setShowDepsWarning(true)
                    return
                }
            }
        }
        setActionLoading(true)
        try {
            await window.api.installMod(mod.id, gamePath)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    async function handleUninstall() {
        if (!gamePath || !mod) return
        setActionLoading(true)
        try {
            await window.api.uninstallMod(mod.id, gamePath)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    async function handleEnable() {
        if (!gamePath || !mod) return
        setActionLoading(true)
        try {
            await window.api.enableMod(mod.id, gamePath)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    async function handleDisable() {
        if (!gamePath || !mod) return
        setActionLoading(true)
        try {
            await window.api.disableMod(mod.id, gamePath)
            await onRefreshInstalled()
        } finally {
            setActionLoading(false)
        }
    }

    const canAct = !!gamePath && !actionLoading && !loading

    const allDeps: ModDependency[] = [
        ...(mod?.dependencies ?? []),
        ...(mod?.instructs_template?.dependencies ?? []),
    ]

    const missingRequired = allDeps.filter(
        (d) => !d.optional && !installed.some((m) => m.id === d.mod.id)
    )

    const tabs: { id: Tab; label: string }[] = [
        { id: 'description', label: 'Description' },
        { id: 'images', label: `Images${mod?.images?.length ? ` (${mod.images.length})` : ''}` },
        { id: 'downloads', label: `Downloads${files.length ? ` (${files.length})` : ''}` },
        { id: 'deps', label: 'Dependencies & Instructions' },
    ]

    return (
        <div className="h-full flex flex-col">
            {showFileSelect && mod && (
                <FileSelectModal
                    mod={mod}
                    files={files}
                    gamePath={gamePath}
                    installedMod={installedMod}
                    onRefreshInstalled={onRefreshInstalled}
                    onClose={() => setShowFileSelect(false)}
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
                        if (permanent) await window.api.dismissDepsWarning(modId)
                        setShowDepsWarning(false)
                    }}
                />
            )}
            {/* Top bar */}
            <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-3 relative">
                <button
                    onClick={onBack}
                    className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1.5 shrink-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
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
                                checked={installedMod.enabled}
                                onChange={(v) => (v ? handleEnable() : handleDisable())}
                                disabled={!canAct}
                            />
                            <button
                                disabled={!canAct}
                                onClick={handleUninstall}
                                title="Remove"
                                className="p-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    {mod && !installedMod && (
                        <button
                            disabled={!canAct || !mod.has_download}
                            onClick={handleInstall}
                            className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                        >
                            {!actionLoading && <Download className="w-3.5 h-3.5" />}
                            {actionLoading
                                ? downloadProgress
                                    ? downloadProgress.total > 0
                                        ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                        : 'Downloading…'
                                    : 'Installing…'
                                : 'Install'}
                        </button>
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

            {loading && (
                <div className="flex items-center justify-center flex-1 text-text-subtle text-sm">
                    Loading…
                </div>
            )}

            {error && (
                <div className="flex items-center justify-center flex-1">
                    <div className="text-sm text-danger-text">{error}</div>
                </div>
            )}

            {!loading && !error && mod && (
                <div className="flex-1 overflow-y-auto">
                    {/* Banner */}
                    {(mod.banner ?? mod.thumbnail) && (
                        <img
                            src={`${THUMBNAIL_BASE_URL}/${(mod.banner ?? mod.thumbnail)!.file}`}
                            alt={mod.name}
                            className="w-full h-48 object-cover"
                        />
                    )}

                    {/* Mod info */}
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
                                                onClick={() =>
                                                    window.api.openExternal(mod.repo_url!)
                                                }
                                                className="text-accent-bright hover:underline inline-flex items-center gap-0.5"
                                            >
                                                Source
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
                                    v{installedMod?.version ?? mod.version}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-5 mt-4 text-sm">
                            <Stat value={mod.downloads.toLocaleString()} label="Downloads" />
                            <div className="w-px h-7 bg-border" />
                            <Stat value={mod.likes.toLocaleString()} label="Likes" />
                            <div className="w-px h-7 bg-border" />
                            <Stat value={mod.views.toLocaleString()} label="Views" />
                            <div className="ml-auto text-xs text-text-subtle text-right">
                                <div>Published {formatDate(mod.published_at)}</div>
                                <div>Updated {formatDate(mod.bumped_at)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Tab bar */}
                    <div className="flex border-b border-border px-6">
                        {tabs.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`text-xs px-4 py-3 border-b-2 transition-colors ${
                                    tab === t.id
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-text-subtle hover:text-text-muted'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="px-6 py-5">
                        {tab === 'description' && <DescriptionTab mod={mod} />}
                        {tab === 'images' && <ImagesTab mod={mod} onOpenImage={setLightboxIndex} />}
                        {tab === 'downloads' && (
                            <DownloadsTab
                                files={files}
                                mod={mod}
                                gamePath={gamePath}
                                installedMod={installedMod}
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

            {/* Image lightbox */}
            {lightboxIndex !== null && images.length > 0 && (
                <div
                    className="absolute inset-0 bg-black/90 flex items-center justify-center z-50"
                    onClick={() => setLightboxIndex(null)}
                >
                    {/* Prev */}
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

                    {/* Next */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setLightboxIndex((i) => (i! < images.length - 1 ? i! + 1 : 0))
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>

                    {/* Close + counter */}
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
                <p className="text-sm text-text-subtle">No description provided.</p>
            )}

            {mod.changelog && (
                <section>
                    <h2 className="text-sm font-semibold mb-2 text-text">Changelog</h2>
                    <MarkdownContent text={mod.changelog} />
                </section>
            )}

            {mod.license && (
                <section>
                    <h2 className="text-sm font-semibold mb-2 text-text">License</h2>
                    <p className="text-sm text-text-muted">{mod.license}</p>
                </section>
            )}
        </div>
    )
}

function ImagesTab({ mod, onOpenImage }: { mod: Mod; onOpenImage: (index: number) => void }) {
    const images = mod.images ?? []
    if (images.length === 0) {
        return <p className="text-sm text-text-subtle">No images uploaded for this mod.</p>
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
                        className="w-full h-40 object-cover"
                    />
                </button>
            ))}
        </div>
    )
}

function DownloadsTab({
    files,
    mod,
    gamePath,
    installedMod,
    downloadProgress,
    onRefreshInstalled,
}: {
    files: ModFile[]
    mod: Mod
    gamePath: string | null
    installedMod: InstalledMod | undefined
    downloadProgress: { downloaded: number; total: number } | null
    onRefreshInstalled: () => Promise<void>
}) {
    const [installingId, setInstallingId] = useState<number | null>(null)
    const [installError, setInstallError] = useState<string | null>(null)

    async function handleInstallFile(file: ModFile) {
        if (!gamePath) return
        setInstallingId(file.id)
        setInstallError(null)
        try {
            await window.api.installModFile(
                mod.id,
                mod.name,
                file.id,
                file.download_url,
                file.type,
                mod.version,
                gamePath
            )
            await onRefreshInstalled()
        } catch (e) {
            setInstallError(String(e))
        } finally {
            setInstallingId(null)
        }
    }

    if (files.length === 0) {
        return <p className="text-sm text-text-subtle">No files available.</p>
    }
    return (
        <div className="flex flex-col gap-2">
            {installError && (
                <div className="px-4 py-3 rounded-lg bg-danger/30 border border-danger-hover text-sm text-danger-text">
                    {installError}
                </div>
            )}
            {files.map((file) => (
                <div
                    key={file.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg bg-surface-hover border border-border"
                >
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{file.name}</div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-text-subtle">
                            <span className="px-1.5 py-0.5 rounded bg-surface-active uppercase tracking-wide text-[10px]">
                                {file.type}
                            </span>
                            <span>{formatBytes(file.size)}</span>
                            {file.version && <span>v{file.version}</span>}
                            {file.label && <span>{file.label}</span>}
                            {file.downloads != null && (
                                <span>{file.downloads.toLocaleString()} dl</span>
                            )}
                            {file.created_at && <span>{formatDate(file.created_at)}</span>}
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        {(() => {
                            const isInstalled = installedMod?.fileId === file.id
                            return (
                                <button
                                    disabled={!gamePath || installingId === file.id || isInstalled}
                                    onClick={() => handleInstallFile(file)}
                                    className={`text-xs px-3 py-1.5 rounded transition-colors disabled:cursor-not-allowed flex items-center gap-1.5 ${
                                        isInstalled
                                            ? 'bg-success/20 border border-success/40 text-success-text cursor-default'
                                            : 'bg-accent hover:bg-accent-bright disabled:opacity-40'
                                    }`}
                                >
                                    {installingId !== file.id && !isInstalled && (
                                        <Download className="w-3.5 h-3.5" />
                                    )}
                                    {installingId === file.id
                                        ? downloadProgress
                                            ? downloadProgress.total > 0
                                                ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                : 'Downloading…'
                                            : 'Installing…'
                                        : isInstalled
                                          ? 'Installed'
                                          : 'Install'}
                                </button>
                            )
                        })()}
                        <button
                            onClick={() => window.api.openExternal(file.download_url)}
                            className="text-xs px-3 py-1.5 rounded bg-surface-active hover:bg-surface-light transition-colors flex items-center gap-1.5"
                        >
                            Download
                            <ExternalLink className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            ))}
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
    const hasDeps = deps.length > 0

    if (!hasInstructions && !hasDeps) {
        return (
            <p className="text-sm text-text-subtle">
                No installation instructions or dependencies listed.
            </p>
        )
    }

    const required = deps.filter((d) => !d.optional)
    const optional = deps.filter((d) => d.optional)

    return (
        <div className="flex flex-col gap-8 max-w-3xl">
            {hasInstructions && (
                <section>
                    <h2 className="text-sm font-semibold mb-3 text-text">
                        Installation Instructions
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
                    <h2 className="text-sm font-semibold mb-3 text-text">Required Dependencies</h2>
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
                    <h2 className="text-sm font-semibold mb-3 text-text">Optional Dependencies</h2>
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
    const { mod } = dep
    const thumbUrl = mod.thumbnail ? `${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}` : null
    const isInstalled = installed.some((m) => m.id === mod.id)
    const [installing, setInstalling] = useState(false)

    async function handleInstall(e: React.MouseEvent) {
        e.stopPropagation()
        if (!gamePath) return
        setInstalling(true)
        try {
            await window.api.installMod(mod.id, gamePath)
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
                    className="w-10 h-10 rounded object-cover shrink-0"
                />
            ) : (
                <div className="w-10 h-10 rounded bg-surface-active shrink-0" />
            )}
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{mod.name}</div>
                <div className="text-xs text-text-subtle mt-0.5">
                    by {mod.user.name} · v{mod.version} ·{' '}
                    <span className={isInstalled ? 'text-success-text' : 'text-danger-text'}>
                        {isInstalled ? 'Installed' : dep.optional ? 'Not installed' : 'Missing'}
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
                {dep.optional ? 'Optional' : 'Required'}
            </span>
            {!isInstalled && mod.has_download && gamePath && (
                <button
                    disabled={installing}
                    onClick={handleInstall}
                    className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-1.5"
                >
                    {!installing && <Download className="w-3.5 h-3.5" />}
                    {installing ? 'Installing…' : 'Install'}
                </button>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    window.api.openExternal(`https://modworkshop.net/mod/${mod.id}`)
                }}
                title="Open on modworkshop.net"
                className="p-1.5 rounded text-text-subtle hover:text-text hover:bg-surface-active transition-colors shrink-0"
            >
                <ExternalLink className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}
