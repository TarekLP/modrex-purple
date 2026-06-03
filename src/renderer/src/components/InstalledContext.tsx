import { createContext, useContext } from 'react'
import type { DragEvent } from 'react'
import type { InstalledMod, Mod, ModFolder } from '../../../shared/types'
import type { FolderActions } from '../hooks/useFolderActions'
import type { DragItem, DropTarget } from '../hooks/useDragDrop'

export interface InstalledContextValue {
    modData: Map<number, Mod>
    failedIds: Set<number>
    viewMode: 'grid' | 'list'
    gamePath: string | null
    isFiltering: boolean
    visibleFolderIds: Set<string> | undefined
    renderMods: InstalledMod[]
    folders: ModFolder[]
    installed: InstalledMod[]
    onOpenDetail: (modId: number) => void
    loadingMod: string | null
    handleUninstall: (mods: InstalledMod[]) => Promise<void>
    handleEnable: (mods: InstalledMod[]) => Promise<void>
    handleDisable: (mods: InstalledMod[]) => Promise<void>
    handleReinstall: (mods: InstalledMod[]) => Promise<void>
    folderActions: FolderActions
    dragItem: DragItem | null
    dropTarget: DropTarget
    onFolderDragStart: (e: DragEvent, folderId: string) => void
    handleDragEnd: () => void
    onFolderHeaderDragOver: (e: DragEvent, folder: ModFolder) => void
    onDropIntoFolder: (folderId: string) => void
    onNestFolderInto: (srcFolderId: string, targetFolderId: string) => void
    onChildDrop: (
        srcFolderId: string,
        targetId: string,
        targetItemType: 'folder' | 'mod',
        parentId: string | null
    ) => void
    onChildModDragOver: (e: DragEvent, uid: string, parentId: string | null) => void
    onEmptyFolderDragOver: (e: DragEvent, folderId: string) => void
    handleGapDragOver: (e: DragEvent, uid: string, isBefore: boolean) => void
    onModDropDirect: (targetRepUid: string, isBefore: boolean) => void
    onModDragStart: (e: DragEvent, uid: string) => void
    onModDragOver: (e: DragEvent, uid: string) => void
    onModDrop: (targetRepUid: string) => void
}

const InstalledContext = createContext<InstalledContextValue | null>(null)

export function useInstalledContext(): InstalledContextValue {
    const ctx = useContext(InstalledContext)
    if (!ctx) throw new Error('useInstalledContext used outside InstalledContext.Provider')
    return ctx
}

export { InstalledContext }
