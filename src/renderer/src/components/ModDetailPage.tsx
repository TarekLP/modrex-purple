import { useState, useEffect, useCallback } from 'react'
import { marked } from 'marked'
import type { Mod, ModFile, ModDependency, InstalledMod } from '../../../shared/types'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'

marked.use({ gfm: true, breaks: true })

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

function renderMarkdown(text: string): string {
    return String(marked.parse(text))
}

function MarkdownContent({ text }: { text: string }) {
    function handleClick(e: React.MouseEvent<HTMLDivElement>) {
        const anchor = (e.target as HTMLElement).closest('a')
        if (anchor?.href) {
            e.preventDefault()
            window.api.openExternal(anchor.href)
        }
    }
    return (
        <div
            className="mod-desc text-sm text-text-muted leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            onClick={handleClick}
        />
    )
}

interface Props {
    modId: number
    gamePath: string | null
    installed: InstalledMod[]
    onBack: () => void
    onRefreshInstalled: () => Promise<void>
}

export function ModDetailPage({ modId, gamePath, installed, onBack, onRefreshInstalled }: Props) {
    const [mod, setMod] = useState<Mod | null>(null)
    const [files, setFiles] = useState<ModFile[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tab, setTab] = useState<Tab>('description')
    const [actionLoading, setActionLoading] = useState(false)
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

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
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                if (lightboxUrl) setLightboxUrl(null)
                else onBack()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [lightboxUrl, onBack])

    async function handleInstall() {
        if (!gamePath || !mod) return
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

    const tabs: { id: Tab; label: string }[] = [
        { id: 'description', label: 'Description' },
        { id: 'images', label: `Images${mod?.images?.length ? ` (${mod.images.length})` : ''}` },
        { id: 'downloads', label: `Downloads${files.length ? ` (${files.length})` : ''}` },
        { id: 'deps', label: 'Dependencies & Instructions' },
    ]

    return (
        <div className="h-full flex flex-col">
            {/* Top bar */}
            <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1.5 shrink-0"
                >
                    ← Back
                </button>
                {mod && (
                    <span className="text-sm text-text-subtle truncate hidden sm:block">
                        {mod.name}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                    {mod && installedMod && (
                        <>
                            {installedMod.enabled ? (
                                <button
                                    disabled={!canAct}
                                    onClick={handleDisable}
                                    className="text-xs px-3 py-1.5 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 transition-colors"
                                >
                                    Disable
                                </button>
                            ) : (
                                <button
                                    disabled={!canAct}
                                    onClick={handleEnable}
                                    className="text-xs px-3 py-1.5 rounded bg-surface-active hover:bg-surface-light disabled:opacity-40 transition-colors"
                                >
                                    Enable
                                </button>
                            )}
                            <button
                                disabled={!canAct}
                                onClick={handleUninstall}
                                className="text-xs px-3 py-1.5 rounded bg-danger hover:bg-danger-hover disabled:opacity-40 transition-colors"
                            >
                                {actionLoading ? 'Working…' : 'Remove'}
                            </button>
                        </>
                    )}
                    {mod && !installedMod && (
                        <button
                            disabled={!canAct || !mod.has_download}
                            onClick={handleInstall}
                            className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {actionLoading ? 'Installing…' : 'Install'}
                        </button>
                    )}
                </div>
            </div>

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
                                                className="text-accent-bright hover:underline"
                                            >
                                                Source
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
                                {installedMod && (
                                    <div
                                        className={`mt-0.5 ${installedMod.enabled ? 'text-success-text' : 'text-text-subtle'}`}
                                    >
                                        {installedMod.enabled ? 'Enabled' : 'Disabled'}
                                    </div>
                                )}
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
                        {tab === 'images' && <ImagesTab mod={mod} onOpenImage={setLightboxUrl} />}
                        {tab === 'downloads' && <DownloadsTab files={files} />}
                        {tab === 'deps' && <DepsTab mod={mod} deps={allDeps} />}
                    </div>
                </div>
            )}

            {/* Image lightbox */}
            {lightboxUrl && (
                <div
                    className="absolute inset-0 bg-black/85 flex items-center justify-center z-50 p-8"
                    onClick={() => setLightboxUrl(null)}
                >
                    <img
                        src={lightboxUrl}
                        alt=""
                        className="max-w-full max-h-full object-contain rounded"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={() => setLightboxUrl(null)}
                        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none"
                    >
                        ×
                    </button>
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

function ImagesTab({ mod, onOpenImage }: { mod: Mod; onOpenImage: (url: string) => void }) {
    const images = mod.images ?? []
    if (images.length === 0) {
        return <p className="text-sm text-text-subtle">No images uploaded for this mod.</p>
    }
    return (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {images.map((img) => {
                const url = `${THUMBNAIL_BASE_URL}/${img.file}`
                return (
                    <button
                        key={img.id}
                        onClick={() => onOpenImage(url)}
                        className="rounded-lg overflow-hidden border border-border hover:border-accent transition-colors focus:outline-none"
                    >
                        <img src={url} alt="" className="w-full h-40 object-cover" />
                    </button>
                )
            })}
        </div>
    )
}

function DownloadsTab({ files }: { files: ModFile[] }) {
    if (files.length === 0) {
        return <p className="text-sm text-text-subtle">No files available.</p>
    }
    return (
        <div className="flex flex-col gap-2">
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
                    <button
                        onClick={() => window.api.openExternal(file.download_url)}
                        className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright transition-colors shrink-0"
                    >
                        Download
                    </button>
                </div>
            ))}
        </div>
    )
}

function DepsTab({ mod, deps }: { mod: Mod; deps: ModDependency[] }) {
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
                            <DepRow key={dep.id} dep={dep} />
                        ))}
                    </div>
                </section>
            )}

            {optional.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold mb-3 text-text">Optional Dependencies</h2>
                    <div className="flex flex-col gap-2">
                        {optional.map((dep) => (
                            <DepRow key={dep.id} dep={dep} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function DepRow({ dep }: { dep: ModDependency }) {
    const { mod } = dep
    const thumbUrl = mod.thumbnail ? `${THUMBNAIL_BASE_URL}/${mod.thumbnail.file}` : null

    return (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-hover border border-border">
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
                    by {mod.user.name} · v{mod.version}
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
            <button
                onClick={() => window.api.openExternal(`https://modworkshop.net/mod/${mod.id}`)}
                className="text-xs px-3 py-1.5 rounded bg-surface-active hover:bg-surface-light transition-colors shrink-0"
            >
                View ↗
            </button>
        </div>
    )
}
