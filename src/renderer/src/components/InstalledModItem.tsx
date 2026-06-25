import { FolderSymlink } from 'lucide-react'
import { t } from '../i18n'
import type { InstalledMod } from '../../../shared/types'
import { ModCard } from './ModCard'
import { ModListRow } from './ModListRow'
import { SkeletonCard } from './SkeletonCard'
import { SkeletonListRow } from './SkeletonListRow'
import { Tooltip } from './Tooltip'
import { syntheticMod, findSuspectDuplicateGroups } from '../hooks/installedUtils'
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

    const ins = mods[0]
    const id = ins.id
    const repUid = ins.uid
    // Stable across file deletions (repUid is not — the rep file can be the one deleted)
    const groupKey = id >= 0 ? `id:${id}` : `uid:${repUid}`
    const showManageFiles = manageFilesKey === groupKey
    const apiMod = modData.get(id)
    // Cheap structural pre-filter only (no network) — see findSuspectDuplicateGroups in
    // installedUtils.ts. ManageFilesModal does the live-data check before badging a specific
    // file "Outdated"; this just hints that one of this group's files is worth checking there.
    const hasSuspectDuplicate = mods.length > 1 && findSuspectDuplicateGroups(mods).length > 0
    const isBusy = mods.some((m) => loadingMod === m.uid)
    const isDragging = dragItem?.kind === 'mod' && dragItem.uid === repUid
    const combined: InstalledMod = {
        ...ins,
        enabled: mods.some((m) => m.enabled),
        missing: mods.some((m) => m.missing) ? true : undefined,
        archiveBroken: mods.some((m) => m.archiveBroken) ? true : undefined,
    }
    // CB-only: the primary mods/ (ModKit) and legacy ~mods targets are alternate shapes of the
    // same content (see CLAUDE.md's Crime Boss section) — ue4ss_mods and host packs aren't.
    const canMoveCrimeBossTarget =
        activeGame === 'cb' &&
        (combined.location === undefined || combined.location === 'paks') &&
        !combined.missing
    const moveCrimeBossButton = canMoveCrimeBossTarget ? (
        <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-surface-raised/80 border border-border text-[10px] text-text-subtle">
                {combined.location === 'paks'
                    ? t('installed.crimeBossMove.legacyBadge')
                    : t('installed.crimeBossMove.modkitBadge')}
            </span>
            <Tooltip
                content={
                    combined.location === 'paks'
                        ? t('installed.crimeBossMove.toModKit')
                        : t('installed.crimeBossMove.toLegacy')
                }
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        requestMoveCrimeBossTarget(ins)
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded bg-surface-raised/80 border border-border text-text-subtle hover:text-text hover:border-accent/60 transition-colors"
                >
                    <FolderSymlink className="w-3.5 h-3.5" />
                </button>
            </Tooltip>
        </div>
    ) : null

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
                {mods.length > 1 && (
                    <Tooltip
                        content={t('installed.manageFiles.staleDuplicateHint')}
                        disabled={!hasSuspectDuplicate}
                    >
                        <button
                            onClick={() => setManageFilesKey(groupKey)}
                            className={`absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                                hasSuspectDuplicate
                                    ? 'bg-warning/20 border-warning/40 text-warning hover:border-warning'
                                    : 'bg-surface-raised/80 border-border text-text-subtle hover:text-text hover:border-accent/60'
                            }`}
                        >
                            {t('installed.fileCount', { count: mods.length })}
                        </button>
                    </Tooltip>
                )}
                {moveCrimeBossButton && (
                    <div className="absolute top-1.5 right-1.5 z-10">{moveCrimeBossButton}</div>
                )}
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
                    onOpen={apiMod ? () => onOpenDetail(id) : () => {}}
                    onUninstall={() => handleUninstall(mods)}
                    onEnable={() => handleEnable(mods)}
                    onDisable={() => handleDisable(mods)}
                    onReinstall={() => handleReinstall(mods)}
                    onDragStart={(e) => onModDragStart(e, repUid)}
                    onDragEnd={handleDragEnd}
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
            {mods.length > 1 && (
                <Tooltip
                    content={t('installed.manageFiles.staleDuplicateHint')}
                    disabled={!hasSuspectDuplicate}
                >
                    <button
                        onClick={() => setManageFilesKey(groupKey)}
                        className={`absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                            hasSuspectDuplicate
                                ? 'bg-warning/20 border-warning/40 text-warning hover:border-warning'
                                : 'bg-surface-raised/80 border-border text-text-subtle hover:text-text hover:border-accent/60'
                        }`}
                    >
                        {t('installed.fileCount', { count: mods.length })}
                    </button>
                </Tooltip>
            )}
            {moveCrimeBossButton && (
                <div className="absolute top-2 right-2 z-10">{moveCrimeBossButton}</div>
            )}
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
                onOpen={apiMod ? () => onOpenDetail(id) : () => {}}
                onInstall={() => {}}
                onUninstall={() => handleUninstall(mods)}
                onEnable={() => handleEnable(mods)}
                onDisable={() => handleDisable(mods)}
                onReinstall={() => handleReinstall(mods)}
            />
        </div>
    )
}
