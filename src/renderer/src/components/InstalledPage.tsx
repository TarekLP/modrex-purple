import { useState, useMemo } from 'react'
import { X, Search, LayoutGrid, List, FolderOpen, FolderPlus, RefreshCw } from 'lucide-react'
import { t } from '../i18n'
import { Tooltip } from './Tooltip'
import { ZipPickerModal } from './ZipPickerModal'
import { HostPackModal } from './HostPackModal'
import { UnrecognizedArchiveModal } from './UnrecognizedArchiveModal'
import { CrimeBossFlatArchiveModal } from './CrimeBossFlatArchiveModal'
import { MoveCrimeBossTargetModal } from './MoveCrimeBossTargetModal'
import { UpdatesModal } from './UpdatesModal'
import { DeleteFolderModal } from './DeleteFolderModal'
import { FolderSection, NewFolderInput } from './FolderSection'
import { InstalledModItem } from './InstalledModItem'
import { InstalledContext } from './InstalledContext'
import type { InstalledMod, ModFolder, GameId } from '../../../shared/types'
import { GAME_STORAGE_KEY, GAMES } from '../../../shared/types'
import { useModData } from '../hooks/useModData'
import { useDragDrop } from '../hooks/useDragDrop'
import { useFolderActions } from '../hooks/useFolderActions'
import { useModActions } from '../hooks/useModActions'
import {
    computeChildren,
    groupChildren,
    normalizeModScopes,
    filterInstalled,
} from '../hooks/installedUtils'
import { api } from '../api'

type ViewMode = 'grid' | 'list'

function getSavedViewMode(): ViewMode {
    const saved = localStorage.getItem(`modrex:${GAME_STORAGE_KEY}:installed-view`)
    return saved === 'list' ? 'list' : 'grid'
}

interface Props {
    activeGame: GameId
    gamePath: string | null
    installed: InstalledMod[]
    folders: ModFolder[]
    installedReady: boolean
    onRefreshInstalled: () => Promise<void>
    onOpenDetail: (modId: number) => void
}

export function InstalledPage({
    activeGame,
    gamePath,
    installed,
    folders,
    installedReady,
    onRefreshInstalled,
    onOpenDetail,
}: Props) {
    const [viewMode, setViewMode] = useState<ViewMode>(getSavedViewMode)
    const { modData, failedIds, updatable } = useModData(installed, GAMES[activeGame].workshopId)
    const [showUpdates, setShowUpdates] = useState(false)
    const [filterQuery, setFilterQuery] = useState('')
    // Which group's ManageFilesModal is open. Lives here (not in InstalledModItem)
    // because items remount when their uid-derived keys shift after a deletion.
    const [manageFilesKey, setManageFilesKey] = useState<string | null>(null)

    const {
        loadingMod,
        reinstallProgress,
        reinstallError,
        clearReinstallError,
        refreshing,
        zipPickerData,
        clearZipPickerData,
        hostPackData,
        clearHostPackData,
        unrecognizedModId,
        clearUnrecognizedModId,
        cbFlatArchiveData,
        clearCbFlatArchiveData,
        movingCrimeBossTarget,
        crimeBossMoveBusy,
        crimeBossMoveError,
        handleRefresh,
        handleUninstall,
        handleEnable,
        handleDisable,
        handleReinstall,
        requestMoveCrimeBossTarget,
        confirmMoveCrimeBossTarget,
        cancelMoveCrimeBossTarget,
    } = useModActions(gamePath, onRefreshInstalled, activeGame)

    const folderActions = useFolderActions(gamePath, onRefreshInstalled, activeGame)

    const {
        dragItem,
        dropTarget,
        scrollContainerRef,
        handleContainerDragOver,
        handleDragEnd,
        onModDragStart,
        onModDragOver,
        onFolderHeaderDragOver,
        onChildModDragOver,
        onEmptyFolderDragOver,
        handleGapDragOver,
        onModDropDirect,
        onModDrop,
        onDropIntoFolder,
        onFolderDragStart,
        onChildDrop,
        onNestFolderInto,
    } = useDragDrop({ installed, folders, gamePath, modData, onRefreshInstalled, activeGame })

    const isFiltering = filterQuery.trim().length > 0
    const { mods: displayMods, visibleFolderIds } = isFiltering
        ? filterInstalled(installed, folders, filterQuery.trim())
        : { mods: installed, visibleFolderIds: undefined }

    const totalUniqueMods = new Set(
        installed.map((m) => (m.id >= 0 ? `id:${m.id}` : `uid:${m.uid}`))
    ).size
    const filteredUniqueMods = new Set(
        displayMods.map((m) => (m.id >= 0 ? `id:${m.id}` : `uid:${m.uid}`))
    ).size

    function setView(mode: ViewMode) {
        setViewMode(mode)
        localStorage.setItem(`modrex:${GAME_STORAGE_KEY}:installed-view`, mode)
    }

    const renderMods = useMemo(() => normalizeModScopes(displayMods), [displayMods])

    const rootChildren = useMemo(
        () => computeChildren(renderMods, folders, null, visibleFolderIds),
        [renderMods, folders, visibleFolderIds]
    )

    function renderRootMod(mods: InstalledMod[], isFolderDropZone = false) {
        const repUid = mods[0].uid
        const isDropBefore =
            isFolderDropZone &&
            dragItem?.kind === 'folder' &&
            dropTarget?.kind === 'before-child' &&
            dropTarget.id === repUid
        const isDropAfter =
            isFolderDropZone &&
            dragItem?.kind === 'folder' &&
            dropTarget?.kind === 'after-child' &&
            dropTarget.id === repUid

        if (viewMode === 'list') {
            return (
                <div
                    key={repUid}
                    onDragOver={
                        isFolderDropZone ? (e) => onChildModDragOver(e, repUid, null) : undefined
                    }
                    onDrop={
                        isFolderDropZone
                            ? () =>
                                  dragItem?.kind === 'folder' &&
                                  onChildDrop(dragItem.id, repUid, 'mod', null)
                            : undefined
                    }
                >
                    {isDropBefore && <div className="h-0.5 rounded-full bg-accent mx-2 mb-1" />}
                    <InstalledModItem mods={mods} />
                    {isDropAfter && <div className="h-0.5 rounded-full bg-accent mx-2 mt-1" />}
                </div>
            )
        }
        return (
            <div key={repUid} className="relative">
                <InstalledModItem mods={mods} />
            </div>
        )
    }

    const ctx = {
        modData,
        failedIds,
        viewMode,
        activeGame,
        gamePath,
        isFiltering,
        visibleFolderIds,
        renderMods,
        folders,
        installed,
        onRefreshInstalled,
        onOpenDetail,
        manageFilesKey,
        setManageFilesKey,
        loadingMod,
        reinstallProgress,
        reinstallError,
        clearReinstallError,
        handleUninstall,
        handleEnable,
        handleDisable,
        handleReinstall,
        requestMoveCrimeBossTarget,
        folderActions,
        dragItem,
        dropTarget,
        onFolderDragStart,
        handleDragEnd,
        onFolderHeaderDragOver,
        onDropIntoFolder,
        onNestFolderInto,
        onChildDrop,
        onChildModDragOver,
        onEmptyFolderDragOver,
        handleGapDragOver,
        onModDropDirect,
        onModDragStart,
        onModDragOver,
        onModDrop,
    }

    return (
        <InstalledContext.Provider value={ctx}>
            <div className="h-full flex flex-col">
                {zipPickerData && gamePath && (
                    <ZipPickerModal
                        payload={zipPickerData}
                        gamePath={gamePath}
                        installedFiles={installed}
                        gameId={activeGame}
                        onRefreshInstalled={onRefreshInstalled}
                        onClose={clearZipPickerData}
                    />
                )}
                {hostPackData && gamePath && (
                    <HostPackModal
                        payload={hostPackData}
                        gamePath={gamePath}
                        installed={installed}
                        gameId={activeGame}
                        onRefreshInstalled={onRefreshInstalled}
                        onClose={clearHostPackData}
                    />
                )}
                {cbFlatArchiveData && gamePath && (
                    <CrimeBossFlatArchiveModal
                        payload={cbFlatArchiveData}
                        gamePath={gamePath}
                        onRefreshInstalled={onRefreshInstalled}
                        onClose={clearCbFlatArchiveData}
                    />
                )}
                {unrecognizedModId !== null && (
                    <UnrecognizedArchiveModal
                        modId={unrecognizedModId}
                        onClose={clearUnrecognizedModId}
                    />
                )}
                {movingCrimeBossTarget && (
                    <MoveCrimeBossTargetModal
                        modName={movingCrimeBossTarget.name}
                        toLegacy={!movingCrimeBossTarget.location}
                        busy={crimeBossMoveBusy}
                        error={crimeBossMoveError}
                        onConfirm={confirmMoveCrimeBossTarget}
                        onCancel={cancelMoveCrimeBossTarget}
                    />
                )}
                <div className="px-6 py-4 border-b border-border shrink-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-semibold">{t('installed.title')}</h1>
                            {gamePath && (
                                <Tooltip content={t('installed.openFolder')}>
                                    <button
                                        onClick={() => api.openModsFolder(activeGame)}
                                        className="p-1 rounded bg-surface-hover hover:bg-surface-active text-text-subtle hover:text-text transition-colors"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                    </button>
                                </Tooltip>
                            )}
                            <Tooltip content={t('installed.refresh')}>
                                <button
                                    onClick={handleRefresh}
                                    disabled={refreshing}
                                    className="p-1 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed text-text-subtle hover:text-text transition-colors"
                                >
                                    <RefreshCw
                                        className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                                    />
                                </button>
                            </Tooltip>
                        </div>
                        <div className="flex items-center gap-3">
                            {installed.length > 0 && (
                                <span className="text-xs text-text-subtle">
                                    {isFiltering
                                        ? t('installed.modCountFiltered', {
                                              count: filteredUniqueMods,
                                              total: totalUniqueMods,
                                          })
                                        : t(
                                              totalUniqueMods === 1
                                                  ? 'installed.modCountSingle'
                                                  : 'installed.modCount',
                                              { count: totalUniqueMods }
                                          )}
                                </span>
                            )}
                            {gamePath && (
                                <button
                                    onClick={() => folderActions.startCreateFolder(null)}
                                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-surface-hover hover:bg-surface-active text-text-subtle hover:text-text transition-colors"
                                >
                                    <FolderPlus className="w-3.5 h-3.5" />
                                    {t('installed.newFolder')}
                                </button>
                            )}
                            <div className="flex items-center gap-1 bg-surface-hover rounded p-0.5">
                                <Tooltip content={t('installed.gridView')}>
                                    <button
                                        onClick={() => setView('grid')}
                                        className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-surface-active text-text' : 'text-text-subtle hover:text-text'}`}
                                    >
                                        <LayoutGrid className="w-3.5 h-3.5" />
                                    </button>
                                </Tooltip>
                                <Tooltip content={t('installed.listView')}>
                                    <button
                                        onClick={() => setView('list')}
                                        className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'bg-surface-active text-text' : 'text-text-subtle hover:text-text'}`}
                                    >
                                        <List className="w-3.5 h-3.5" />
                                    </button>
                                </Tooltip>
                            </div>
                        </div>
                    </div>
                    {installed.length > 0 && (
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle pointer-events-none" />
                            <input
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                                placeholder={t('installed.filterPlaceholder')}
                                className={`w-full text-sm pl-8 py-1.5 rounded bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors ${filterQuery ? 'pr-7' : 'pr-3'}`}
                            />
                            {filterQuery && (
                                <button
                                    onClick={() => setFilterQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {reinstallError && (
                    <div className="px-6 py-2 shrink-0 flex items-center justify-between gap-3 bg-danger/10 border-b border-danger/30 text-danger text-xs">
                        <span className="truncate">
                            {t('installed.reinstallFailed', { error: reinstallError })}
                        </span>
                        <button
                            onClick={clearReinstallError}
                            className="shrink-0 hover:opacity-70 transition-opacity"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
                <div
                    ref={scrollContainerRef}
                    onDragOver={handleContainerDragOver}
                    className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3"
                >
                    {!installedReady ? (
                        <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                            {t('common.loading')}
                        </div>
                    ) : installed.length === 0 && folders.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                            {t('installed.empty')}
                        </div>
                    ) : isFiltering && displayMods.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-text-subtle text-sm">
                            {t('installed.filterEmpty', { query: filterQuery.trim() })}
                        </div>
                    ) : (
                        <>
                            {updatable.length > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-accent/10 border border-accent/30">
                                    <span className="text-sm font-medium text-accent">
                                        {t(
                                            updatable.length === 1
                                                ? 'installed.updatesAvailableSingle'
                                                : 'installed.updatesAvailable',
                                            { count: updatable.length }
                                        )}
                                    </span>
                                    <button
                                        onClick={() => setShowUpdates(true)}
                                        className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright transition-colors"
                                    >
                                        {t('installed.reviewUpdates')}
                                    </button>
                                </div>
                            )}

                            {folderActions.creatingFolderParentId === null && <NewFolderInput />}

                            {viewMode === 'list' ? (
                                <div className="flex flex-col gap-1.5">
                                    {rootChildren.map((item) =>
                                        item.type === 'folder' ? (
                                            <FolderSection
                                                key={item.folder.id}
                                                folder={item.folder}
                                            />
                                        ) : (
                                            renderRootMod(item.mods)
                                        )
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {groupChildren(rootChildren).map((group) => {
                                        if (group.type === 'folder') {
                                            return (
                                                <FolderSection
                                                    key={group.folder.id}
                                                    folder={group.folder}
                                                />
                                            )
                                        }
                                        const leaderId = group.groups[0][0].uid
                                        const isGroupDropBefore =
                                            dragItem?.kind === 'folder' &&
                                            dropTarget?.kind === 'before-child' &&
                                            dropTarget.id === leaderId
                                        const isGroupDropAfter =
                                            dragItem?.kind === 'folder' &&
                                            dropTarget?.kind === 'after-child' &&
                                            dropTarget.id === leaderId
                                        return (
                                            <div
                                                key={`rg-${leaderId}`}
                                                className="relative grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4"
                                                onDragOver={(e) =>
                                                    onChildModDragOver(e, leaderId, null)
                                                }
                                                onDrop={() =>
                                                    dragItem?.kind === 'folder' &&
                                                    onChildDrop(dragItem.id, leaderId, 'mod', null)
                                                }
                                            >
                                                {isGroupDropBefore && (
                                                    <div className="absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-accent pointer-events-none" />
                                                )}
                                                {isGroupDropAfter && (
                                                    <div className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-accent pointer-events-none" />
                                                )}
                                                {group.groups.map((mods) => renderRootMod(mods))}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {showUpdates && (
                    <UpdatesModal
                        updatable={updatable}
                        modData={modData}
                        installed={installed}
                        gamePath={gamePath}
                        gameId={activeGame}
                        onRefreshInstalled={onRefreshInstalled}
                        onClose={() => setShowUpdates(false)}
                        onOpenDetail={onOpenDetail}
                    />
                )}

                {folderActions.deletingFolderId !== null && (
                    <DeleteFolderModal
                        onConfirm={folderActions.confirmDeleteFolder}
                        onCancel={folderActions.cancelDelete}
                    />
                )}
            </div>
        </InstalledContext.Provider>
    )
}
