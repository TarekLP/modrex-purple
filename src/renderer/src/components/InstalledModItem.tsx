import { t } from '../i18n'
import type { InstalledMod } from '../../../shared/types'
import { ModCard } from './ModCard'
import { ModListRow } from './ModListRow'
import { SkeletonCard } from './SkeletonCard'
import { SkeletonListRow } from './SkeletonListRow'
import { syntheticMod } from '../hooks/installedUtils'
import { useInstalledContext } from './InstalledContext'

export function InstalledModItem({ mods }: { mods: InstalledMod[] }) {
    const {
        viewMode,
        gamePath,
        modData,
        failedIds,
        loadingMod,
        dragItem,
        dropTarget,
        onOpenDetail,
        handleUninstall,
        handleEnable,
        handleDisable,
        handleReinstall,
        onModDragStart,
        onModDragOver,
        onModDrop,
        handleDragEnd,
        handleGapDragOver,
        onModDropDirect,
    } = useInstalledContext()

    const ins = mods[0]
    const id = ins.id
    const repUid = ins.uid
    const apiMod = modData.get(id)
    const isBusy = mods.some((m) => loadingMod === m.uid)
    const isDragging = dragItem?.kind === 'mod' && dragItem.uid === repUid
    const combined: InstalledMod = {
        ...ins,
        enabled: mods.every((m) => m.enabled),
        missing: mods.some((m) => m.missing) ? true : undefined,
        archiveBroken: mods.some((m) => m.archiveBroken) ? true : undefined,
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
                {mods.length > 1 && (
                    <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-surface-raised/80 border border-border text-[10px] text-text-subtle pointer-events-none">
                        {t('installed.fileCount', { count: mods.length })}
                    </div>
                )}
                <ModListRow
                    mod={mod}
                    installed={combined}
                    gamePath={gamePath}
                    loading={isBusy}
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
                <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-surface-raised/80 border border-border text-[10px] text-text-subtle pointer-events-none">
                    {t('installed.fileCount', { count: mods.length })}
                </div>
            )}
            <ModCard
                mod={mod}
                installed={combined}
                gamePath={gamePath}
                loading={isBusy}
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
