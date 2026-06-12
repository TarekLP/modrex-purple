import { useState, useMemo, useEffect, useRef } from 'react'
import { X, Folder } from 'lucide-react'
import type { GameId, InstalledMod } from '../../../shared/types'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import { api } from '../api'
import { setArchiveEntries } from '../archiveEntriesCache'
import { entryFilename, stripPriorityPrefix } from '../hooks/installedUtils'

export interface ZipMultiPakPayload {
    zipPath: string
    entries: string[]
    modId: number
    modName: string
    fileId: number
    fileType: string
    modVersion: string
    targetTag?: string
}

export function parseZipMultiPak(error: string): ZipMultiPakPayload | null {
    const PREFIX = 'ZIP_MULTI_PAK:'
    if (!error.startsWith(PREFIX)) return null
    try {
        return JSON.parse(error.slice(PREFIX.length)) as ZipMultiPakPayload
    } catch {
        return null
    }
}

function computePrefix(entries: string[]): string {
    if (entries.length === 0) return ''
    let prefix = ''
    for (;;) {
        const next = entries[0].indexOf('/', prefix.length)
        if (next === -1) return prefix
        const candidate = entries[0].slice(0, next + 1)
        if (!entries.every((e) => e.startsWith(candidate))) return prefix
        prefix = candidate
    }
    // unreachable
}

function stripWrapperPrefix(entries: string[]): string {
    const raw = computePrefix(entries)
    if (!raw) return ''
    const stripped = entries.map((e) => e.slice(raw.length))
    // Flat-only wrappers become an app folder; only strip when entries mix root and subdirs.
    return stripped.some((e) => e.includes('/')) ? raw : ''
}

function groupEntriesByDir(entries: string[], prefix: string): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const entry of entries) {
        const rel = entry.slice(prefix.length)
        const lastSlash = rel.lastIndexOf('/')
        const dir = lastSlash === -1 ? '' : rel.slice(0, lastSlash)
        if (!map.has(dir)) map.set(dir, [])
        map.get(dir)!.push(entry)
    }
    return map
}

function getRequiredDirs(normalizedEntries: string[]): string[] {
    const dirs = new Set<string>()
    for (const entry of normalizedEntries) {
        const lastSlash = entry.lastIndexOf('/')
        if (lastSlash === -1) continue
        const dir = entry.slice(0, lastSlash)
        const parts = dir.split('/')
        for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
    }
    return [...dirs].sort((a, b) => {
        const d = a.split('/').length - b.split('/').length
        return d !== 0 ? d : a.localeCompare(b)
    })
}

function entryStem(entry: string): string {
    const name = entryFilename(entry)
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(0, dot) : name
}

interface Props {
    payload: ZipMultiPakPayload
    gamePath: string
    installedFiles: InstalledMod[]
    folderId?: string | null
    gameId?: string
    onRefreshInstalled: () => Promise<void>
    onClose: () => void
}

export function ZipPickerModal({
    payload,
    gamePath,
    installedFiles,
    folderId,
    gameId,
    onRefreshInstalled,
    onClose,
}: Props) {
    // Entries already installed from this archive (uid is {fileId}_{stem}; the
    // prefix-stripped filename match covers entries whose uid was reassigned by
    // SHA256 reconciliation — installed filenames carry the NNN_ disk prefix).
    const installedEntries = useMemo(() => {
        const set = new Set<string>()
        for (const entry of payload.entries) {
            const uid = `${payload.fileId}_${entryStem(entry)}`
            const filename = entryFilename(entry)
            const isInstalled = installedFiles.some(
                (m) =>
                    !m.missing &&
                    (m.uid === uid ||
                        (m.fileId === payload.fileId &&
                            stripPriorityPrefix(m.filename) === filename))
            )
            if (isInstalled) set.add(entry)
        }
        return set
    }, [payload, installedFiles])

    const selectable = payload.entries.filter((e) => !installedEntries.has(e))

    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(payload.entries.filter((e) => !installedEntries.has(e)))
    )
    const [installingEntry, setInstallingEntry] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number
        total: number
    } | null>(null)
    const progressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const isBusy = installingEntry !== null
    const pendingCount = selected.size

    const { prefix, grouped } = useMemo(() => {
        const p = stripWrapperPrefix(payload.entries)
        return { prefix: p, grouped: groupEntriesByDir(payload.entries, p) }
    }, [payload.entries])

    const isStructured = grouped.size > 1 || (grouped.size === 1 && !grouped.has(''))

    const rootEntries = grouped.get('') ?? []
    const subdirSections = useMemo(
        () =>
            [...grouped.entries()]
                .filter(([dir]) => dir !== '')
                .sort(([a], [b]) => a.localeCompare(b)),
        [grouped]
    )

    useEffect(() => {
        setArchiveEntries((gameId ?? 'pd3') as GameId, payload.fileId, payload.entries)
    }, [payload, gameId])

    useEffect(() => {
        return api.onDownloadProgress(({ downloaded, total }) => {
            setDownloadProgress({ downloaded, total })
            if (progressClearTimer.current) clearTimeout(progressClearTimer.current)
            progressClearTimer.current = setTimeout(() => setDownloadProgress(null), 800)
        })
    }, [])

    function toggle(entry: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(entry)) next.delete(entry)
            else next.add(entry)
            return next
        })
    }

    function toggleAll() {
        setSelected((prev) => (prev.size === selectable.length ? new Set() : new Set(selectable)))
    }

    function toggleGroup(entries: string[]) {
        const groupSelectable = entries.filter((e) => !installedEntries.has(e))
        setSelected((prev) => {
            const allSelected = groupSelectable.every((e) => prev.has(e))
            const next = new Set(prev)
            if (allSelected) groupSelectable.forEach((e) => next.delete(e))
            else groupSelectable.forEach((e) => next.add(e))
            return next
        })
    }

    async function handleInstall() {
        if (selected.size === 0) return
        setError(null)
        const toInstall = payload.entries.filter((e) => selected.has(e))

        const folderIdMap = new Map<string, string | null>([
            ['', payload.targetTag ? null : (folderId ?? null)],
        ])

        if (isStructured && !payload.targetTag) {
            const normalizedToInstall = toInstall.map((e) => e.slice(prefix.length))
            for (const dir of getRequiredDirs(normalizedToInstall)) {
                const lastSlash = dir.lastIndexOf('/')
                const parentDir = lastSlash === -1 ? '' : dir.slice(0, lastSlash)
                const dirName = lastSlash === -1 ? dir : dir.slice(lastSlash + 1)
                try {
                    const folder = await api.createFolder(
                        dirName,
                        folderIdMap.get(parentDir) ?? null,
                        gamePath,
                        gameId
                    )
                    folderIdMap.set(dir, folder.id)
                } catch (e) {
                    setError(String(e))
                    return
                }
            }
            await onRefreshInstalled()
        }

        for (const entry of toInstall) {
            const rel = entry.slice(prefix.length)
            const lastSlash = rel.lastIndexOf('/')
            const dir = lastSlash === -1 ? '' : rel.slice(0, lastSlash)
            setInstallingEntry(entry)
            try {
                await api.installFromZipEntry(
                    payload.zipPath,
                    entry,
                    payload.modId,
                    payload.modName,
                    payload.fileId,
                    payload.fileType,
                    payload.modVersion,
                    gamePath,
                    folderIdMap.get(dir) ?? null,
                    gameId,
                    payload.targetTag
                )
                await onRefreshInstalled()
            } catch (e) {
                setInstallingEntry(null)
                setError(String(e))
                return
            }
        }

        setInstallingEntry(null)
        await api.deleteTempFile(payload.zipPath)
        onClose()
    }

    function renderEntry(entry: string, indented = false) {
        const isInstalling = installingEntry === entry
        const isInstalled = installedEntries.has(entry)
        const name = entry.slice(prefix.length).split('/').pop() ?? entry
        return (
            <div
                key={entry}
                onClick={() => !isInstalled && !isBusy && toggle(entry)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    isInstalled
                        ? 'bg-surface-hover border-border opacity-60'
                        : selected.has(entry)
                          ? 'bg-accent/5 border-accent/40 cursor-pointer'
                          : 'bg-surface-hover border-border cursor-pointer'
                } ${isBusy ? 'cursor-not-allowed opacity-60' : isInstalled ? '' : 'hover:bg-surface-active'} ${
                    indented ? 'ml-4' : ''
                }`}
            >
                <input
                    type="checkbox"
                    checked={isInstalled || selected.has(entry)}
                    onChange={() => toggle(entry)}
                    disabled={isInstalled || isBusy}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-accent w-4 h-4 shrink-0"
                />
                <span className="text-sm font-medium truncate flex-1">{name}</span>
                {isInstalling ? (
                    <span className="text-xs text-text-muted shrink-0">
                        {downloadProgress && downloadProgress.total > 0
                            ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                            : t('common.installing')}
                    </span>
                ) : isInstalled ? (
                    <span className="text-xs text-success-text shrink-0">
                        {t('common.installed')}
                    </span>
                ) : null}
            </div>
        )
    }

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && !isBusy && onClose()}
            title={t('zipPicker.title')}
            className="w-[520px] max-h-[75vh]"
        >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{t('zipPicker.title')}</h2>
                    <p className="text-xs text-text-muted mt-0.5 truncate">
                        {t('zipPicker.subtitle', { modName: payload.modName })}
                    </p>
                </div>
                <button
                    onClick={!isBusy ? onClose : undefined}
                    disabled={isBusy}
                    className="text-text-subtle hover:text-text transition-colors shrink-0 mt-0.5 disabled:opacity-40"
                >
                    <X className="w-4 h-4" />
                </button>
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

            <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-2">
                {error && (
                    <div className="px-4 py-3 rounded-lg bg-danger/30 border border-danger-hover text-sm text-danger-text">
                        {error}
                    </div>
                )}

                <div
                    onClick={() => !isBusy && selectable.length > 0 && toggleAll()}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover cursor-pointer hover:bg-surface-active transition-colors"
                >
                    <input
                        type="checkbox"
                        checked={selectable.length > 0 && selected.size === selectable.length}
                        ref={(el) => {
                            if (el)
                                el.indeterminate =
                                    selected.size > 0 && selected.size < selectable.length
                        }}
                        onChange={toggleAll}
                        disabled={isBusy || selectable.length === 0}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-accent w-4 h-4 shrink-0"
                    />
                    <span className="text-xs font-medium text-text-muted">
                        {selectable.length > 0 && selected.size === selectable.length
                            ? t('zipPicker.deselectAll')
                            : t('zipPicker.selectAll', { count: selectable.length })}
                    </span>
                </div>

                {isStructured ? (
                    <>
                        {rootEntries.map((entry) => renderEntry(entry))}
                        {subdirSections.map(([dir, dirEntries]) => {
                            const dirName = dir.split('/').pop() ?? dir
                            const groupSelectable = dirEntries.filter(
                                (e) => !installedEntries.has(e)
                            )
                            const allInGroup =
                                groupSelectable.length > 0 &&
                                groupSelectable.every((e) => selected.has(e))
                            const someInGroup = groupSelectable.some((e) => selected.has(e))
                            return (
                                <div key={dir} className="flex flex-col gap-1.5">
                                    <div
                                        onClick={() =>
                                            !isBusy &&
                                            groupSelectable.length > 0 &&
                                            toggleGroup(dirEntries)
                                        }
                                        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={allInGroup}
                                            ref={(el) => {
                                                if (el)
                                                    el.indeterminate = !allInGroup && someInGroup
                                            }}
                                            onChange={() => toggleGroup(dirEntries)}
                                            disabled={isBusy || groupSelectable.length === 0}
                                            onClick={(e) => e.stopPropagation()}
                                            className="accent-accent w-4 h-4 shrink-0"
                                        />
                                        <Folder className="w-3.5 h-3.5 text-text-muted shrink-0" />
                                        <span className="text-xs font-medium text-text-muted">
                                            {dirName}
                                        </span>
                                        <span className="text-xs text-text-subtle">
                                            ({dirEntries.length})
                                        </span>
                                    </div>
                                    {dirEntries.map((entry) => renderEntry(entry, true))}
                                </div>
                            )
                        })}
                    </>
                ) : (
                    payload.entries.map((entry) => renderEntry(entry))
                )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                <button
                    onClick={!isBusy ? onClose : undefined}
                    disabled={isBusy}
                    className="text-xs px-3 py-1.5 rounded border border-border bg-surface-hover hover:bg-surface-active disabled:opacity-40 transition-colors"
                >
                    {t('common.cancel')}
                </button>
                <button
                    disabled={pendingCount === 0 || isBusy}
                    onClick={handleInstall}
                    className="text-xs px-4 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {isBusy
                        ? t('common.installing')
                        : t('zipPicker.installSelected', { count: pendingCount })}
                </button>
            </div>
        </Dialog>
    )
}
