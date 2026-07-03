import { useState, useRef, useEffect } from 'react'
import { MoreVertical } from 'lucide-react'
import { t } from '../i18n'
import { api } from '../api'
import type { InstalledMod } from '../../../shared/types'
import { GAMES } from '../../../shared/types'
import { ModCard } from './ModCard'
import { ModListRow } from './ModListRow'
import { SkeletonCard } from './SkeletonCard'
import { SkeletonListRow } from './SkeletonListRow'
import { syntheticMod } from '../hooks/installedUtils'
import { useInstalledContext } from './InstalledContext'
import { ManageFilesModal } from './ManageFilesModal'

export function InstalledModItem({ mods }: { mods: InstalledMod[] }) {
    const {
        viewMode,
        activeGame,
        gamePath,
        modData,
        failedIds,
        loadingMod,
        reinstallProgress,
        dragItem,
        dropTarget,
        onOpenDetail,
        handleUninstall,
        handleEnable,
        handleDisable,
        handleReinstall,
        requestMoveCrimeBossTarget,
        onModDragStart,
        onModDragOver,
        onModDrop,
        handleDragEnd,
        handleGapDragOver,
        onModDropDirect,
        manageFilesKey,
        setManageFilesKey,
    } = useInstalledContext()

    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!menuOpen) return
        function handleOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [menuOpen])

    const ins = mods[0]
    const id = ins.id
    const repUid = ins.uid
    // Stable across file deletions (repUid is not — the rep file can be the one deleted)
    const groupKey = id >= 0 ? `id:${id}` : `uid:${repUid}`
    const showManageFiles = manageFilesKey === groupKey
    const apiMod = modData.get(id)
    const isBusy = mods.some((m) => loadingMod === m.uid)
    const isDragging = dragItem?.kind === 'mod' && dragItem.uid === repUid
    const combined: InstalledMod = {
        ...ins,
        enabled: mods.some((m) => m.enabled),
        missing: mods.some((m) => m.missing) ? true : undefined,
        archiveBroken: mods.some((m) => m.archiveBroken) ? true : undefined,
    }
    // Nexus-sourced mods have no in-app detail page; their mod page on
    // nexusmods.com is the equivalent destination (id encodes -nexusModId).
    const nexusDomain = GAMES[activeGame].nexusDomain
    const handleOpen =
        apiMod !== undefined
            ? () => onOpenDetail(id)
            : ins.source === 'nexus' && nexusDomain !== undefined
              ? () => api.openExternal(`https://www.nexusmods.com/${nexusDomain}/mods/${-id}`)
              : () => {}

    // CB-only: the primary mods/ (ModKit) and legacy ~mods targets are alternate shapes of the
    // same content (see CLAUDE.md's Crime Boss section) — ue4ss_mods and host packs aren't.
    const canMoveCrimeBossTarget =
        activeGame === 'cb' &&
        (combined.location === undefined || combined.location === 'paks') &&
        !combined.missing

    function renderMenuButton(dropdownSide: 'right' | 'left') {
        return (
            <div ref={menuRef} className="relative" onDragStart={(e) => e.stopPropagation()}>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen((o) => !o)
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded border border-border text-text-subtle hover:text-text hover:border-accent/60 transition-colors bg-surface-raised/80"
                >
                    <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {menuOpen && (
                    <div
                        className={`absolute top-7 ${dropdownSide === 'right' ? 'right-0' : 'left-0'} min-w-40 bg-surface-raised border border-border rounded-lg shadow-xl overflow-hidden z-50`}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setMenuOpen(false)
                                setManageFilesKey(groupKey)
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-text hover:bg-surface-hover transition-colors"
                        >
                            {t('installed.modMenu.manageFiles')}
                        </button>
                        {canMoveCrimeBossTarget && (
                            <>
                                <div className="h-px bg-border" />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setMenuOpen(false)
                                        requestMoveCrimeBossTarget(ins)
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-text hover:bg-surface-hover transition-colors"
                                >
                                    {combined.location === 'paks'
                                        ? t('installed.crimeBossMove.toModKit')
                                        : t('installed.crimeBossMove.toLegacy')}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        )
    }

    if (!apiMod && !failedIds.has(id) && id >= 0) {
        return viewMode === 'list' ? <SkeletonListRow /> : <SkeletonCard />
    }

    const mod = apiMod ?? syntheticMod(ins)

    if (viewMode === 'list') {
        const isBeforeActive = dropTarget?.kind === 'before-mod' && dropTarget.uid === repUid
        const isAfterActive = dropTarget?.kind === 'after-mod' && dropTarget.uid === repUid
        return (
            <div className="relative">
                <div
                    className="absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: -9, height: 36 }}
                    onDragOver={(e) => handleGapDragOver(e, repUid, true)}
                    onDrop={(e) => {
                        e.preventDefault()
                        onModDropDirect(repUid, true)
                    }}
                >
                    <div
                        className={`h-0.5 w-full mx-2 rounded-full pointer-events-none ${isBeforeActive ? 'bg-accent' : 'opacity-0'}`}
                    />
                </div>
                <div
                    className="absolute left-0 right-0 z-10 flex items-center"
                    style={{ bottom: -9, height: 36 }}
                    onDragOver={(e) => handleGapDragOver(e, repUid, false)}
                    onDrop={(e) => {
                        e.preventDefault()
                        onModDropDirect(repUid, false)
                    }}
                >
                    <div
                        className={`h-0.5 w-full mx-2 rounded-full pointer-events-none ${isAfterActive ? 'bg-accent' : 'opacity-0'}`}
                    />
                </div>
                {showManageFiles && (
                    <ManageFilesModal
                        mods={mods}
                        modName={mod.name}
                        onClose={() => setManageFilesKey(null)}
                    />
                )}
                <ModListRow
                    mod={mod}
                    installed={combined}
                    gamePath={gamePath}
                    loading={isBusy}
                    progress={isBusy ? reinstallProgress : null}
                    isDragging={isDragging}
                    onOpen={handleOpen}
                    onUninstall={() => handleUninstall(mods)}
                    onEnable={() => handleEnable(mods)}
                    onDisable={() => handleDisable(mods)}
                    onReinstall={() => handleReinstall(mods)}
                    onDragStart={(e) => onModDragStart(e, repUid)}
                    onDragEnd={handleDragEnd}
                    optionsButton={renderMenuButton('left')}
                />
            </div>
        )
    }

    return (
        <div
            draggable
            onDragStart={(e) => onModDragStart(e, repUid)}
            onDragOver={(e) => onModDragOver(e, repUid)}
            onDrop={() => onModDrop(repUid)}
            onDragEnd={handleDragEnd}
            className={`relative h-full rounded-lg cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
        >
            {dropTarget?.kind === 'before-mod' && dropTarget.uid === repUid && (
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-accent z-10 pointer-events-none rounded-l-lg" />
            )}
            {dropTarget?.kind === 'after-mod' && dropTarget.uid === repUid && (
                <div className="absolute top-0 bottom-0 right-0 w-1 bg-accent z-10 pointer-events-none rounded-r-lg" />
            )}
            <div
                ref={menuRef}
                className="absolute top-2 right-2 z-20"
                onDragStart={(e) => e.stopPropagation()}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen((o) => !o)
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded border border-border text-text-subtle hover:text-text hover:border-accent/60 transition-colors bg-surface-raised/80"
                >
                    <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-7 min-w-40 bg-surface-raised border border-border rounded-lg shadow-xl overflow-hidden z-50">
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setMenuOpen(false)
                                setManageFilesKey(groupKey)
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-text hover:bg-surface-hover transition-colors"
                        >
                            {t('installed.modMenu.manageFiles')}
                        </button>
                        {canMoveCrimeBossTarget && (
                            <>
                                <div className="h-px bg-border" />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setMenuOpen(false)
                                        requestMoveCrimeBossTarget(ins)
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-text hover:bg-surface-hover transition-colors"
                                >
                                    {combined.location === 'paks'
                                        ? t('installed.crimeBossMove.toModKit')
                                        : t('installed.crimeBossMove.toLegacy')}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
            {showManageFiles && (
                <ManageFilesModal
                    mods={mods}
                    modName={mod.name}
                    onClose={() => setManageFilesKey(null)}
                />
            )}
            <ModCard
                mod={mod}
                installed={combined}
                gamePath={gamePath}
                loading={isBusy}
                progress={isBusy ? reinstallProgress : null}
                onOpen={handleOpen}
                onInstall={() => {}}
                onUninstall={() => handleUninstall(mods)}
                onEnable={() => handleEnable(mods)}
                onDisable={() => handleDisable(mods)}
                onReinstall={() => handleReinstall(mods)}
            />
        </div>
    )
}
