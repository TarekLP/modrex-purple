import { useState, type ReactNode } from 'react'
import { Button } from './ui/Button'
import * as Tabs from '@radix-ui/react-tabs'
import { X } from 'lucide-react'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import { computeHealthSummary } from '../hooks/installedUtils'
import type { InstalledGroup } from '../hooks/installedUtils'
import type { HealthItem, MissingDepRef } from '../hooks/healthCheck'
import type { InstalledMod, Mod } from '../../../shared/types'
import { useThumbnail } from '../hooks/useThumbnail'
import { api } from '../api'

interface LocalHealthItem {
    id: number
    uid: string
    name: string
    mods: InstalledMod[]
}

interface Props {
    installed: InstalledMod[]
    updatable: InstalledMod[]
    modData: Map<number, Mod>
    missingDeps: HealthItem[]
    showDepsTab: boolean
    gamePath: string | null
    gameId: string
    visible: boolean
    onOpenDetail: (modId: number) => void
    onReinstall: (mods: InstalledMod[]) => void
    onDepInstalled: () => Promise<void>
    onReviewUpdates: () => void
    onClose: () => void
}

function HealthRow({
    thumbnailFile,
    name,
    secondary,
    clickable,
    onOpen,
    action,
}: {
    thumbnailFile?: string | null
    name: string
    secondary?: string
    clickable?: boolean
    onOpen?: () => void
    action?: ReactNode
}) {
    const thumbSrc = useThumbnail(thumbnailFile)
    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
            <div className="w-9 h-9 rounded shrink-0 bg-surface-active overflow-hidden">
                {thumbSrc && <img src={thumbSrc} alt="" className="w-full h-full object-cover" />}
            </div>
            <button
                disabled={!clickable}
                onClick={onOpen}
                className={`min-w-0 flex-1 text-left disabled:opacity-100 ${clickable ? 'hover:opacity-80 transition-opacity' : 'cursor-default'}`}
            >
                <div className="text-sm truncate">{name}</div>
                {secondary && <div className="text-xs text-text-subtle truncate">{secondary}</div>}
            </button>
            {action}
        </div>
    )
}

function UpdateRow({
    ins,
    apiMod,
    onOpenDetail,
}: {
    ins: InstalledMod
    apiMod: Mod
    onOpenDetail: (id: number) => void
}) {
    const thumbSrc = useThumbnail(apiMod.thumbnail?.file)
    const hasVersion = ins.version && ins.version !== 'unknown' && ins.version !== 'outdated'
    const versionLine = hasVersion
        ? `${ins.version} to ${apiMod.version}`
        : `${apiMod.version} available`
    return (
        <button
            onClick={() => onOpenDetail(ins.id)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
        >
            <div className="w-9 h-9 rounded shrink-0 bg-surface-active overflow-hidden">
                {thumbSrc && <img src={thumbSrc} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{apiMod.name}</div>
                <div className="text-xs text-text-subtle truncate">{versionLine}</div>
            </div>
        </button>
    )
}

function EmptyTab({ children }: { children: string }) {
    return <p className="text-sm text-text-subtle px-3 py-2">{children}</p>
}

export function HealthCheckModal({
    installed,
    updatable,
    modData,
    missingDeps,
    showDepsTab,
    gamePath,
    gameId,
    visible,
    onOpenDetail,
    onReinstall,
    onDepInstalled,
    onReviewUpdates,
    onClose,
}: Props) {
    const summary = computeHealthSummary(installed)
    const [installingDepId, setInstallingDepId] = useState<number | null>(null)
    const [installingAll, setInstallingAll] = useState(false)
    const [depInstallError, setDepInstallError] = useState<string | null>(null)

    async function installDep(depId: number) {
        if (!gamePath || installingDepId !== null || installingAll) return
        setInstallingDepId(depId)
        setDepInstallError(null)
        try {
            await api.installMod(depId, gamePath, gameId)
            await onDepInstalled()
        } catch {
            setDepInstallError(t('installed.health.installDepFailed'))
        } finally {
            setInstallingDepId(null)
        }
    }

    async function installAllDeps() {
        if (!gamePath || installingAll || installingDepId !== null) return
        const uniqueDepIds = [
            ...new Set(
                missingDeps.flatMap((item) =>
                    (item.missingDeps ?? [])
                        .filter((d): d is MissingDepRef & { id: number } => d.id !== null)
                        .map((d) => d.id)
                )
            ),
        ]
        if (uniqueDepIds.length === 0) return
        setInstallingAll(true)
        setDepInstallError(null)
        let hadError = false
        for (const depId of uniqueDepIds) {
            try {
                await api.installMod(depId, gamePath, gameId)
            } catch {
                hadError = true
            }
        }
        await onDepInstalled().catch(() => {})
        setInstallingAll(false)
        if (hadError) {
            setDepInstallError(t('installed.health.installDepFailed'))
            return
        }
        onClose()
    }

    function toItems(groups: InstalledGroup[]): LocalHealthItem[] {
        return groups.map((g) => ({ id: g.id, uid: g.key, name: g.mods[0].name, mods: g.mods }))
    }

    const missingItems = toItems(summary.missing)
    const brokenItems = toItems(summary.archiveBroken)
    const outdatedItems = toItems(summary.outdated)
    const unidentifiedItems = toItems(summary.unidentified)

    // Lifted out of Tabs.Root (which Radix unmounts along with the rest of Dialog.Content
    // while !visible) so the selected tab survives navigating to a mod's detail page and back.
    const [activeTab, setActiveTab] = useState(() => (showDepsTab ? 'deps' : 'missing'))

    const tabs: { id: string; label: string }[] = [
        ...(showDepsTab
            ? [
                  {
                      id: 'deps',
                      label: t('installed.health.dependenciesCount', { count: missingDeps.length }),
                  },
              ]
            : []),
        {
            id: 'missing',
            label: t('installed.health.missingFilesCount', { count: missingItems.length }),
        },
        {
            id: 'broken',
            label: t('installed.health.brokenArchivesCount', { count: brokenItems.length }),
        },
        {
            id: 'outdated',
            label: t('installed.health.outdatedCount', { count: outdatedItems.length }),
        },
        {
            id: 'unidentified',
            label: t('installed.health.unidentifiedCount', { count: unidentifiedItems.length }),
        },
        {
            id: 'updates',
            label: t('installed.health.updatesCount', { count: updatable.length }),
        },
    ]

    return (
        <Dialog
            open={visible}
            onOpenChange={(open) => !open && onClose()}
            title={t('installed.health.title')}
            className="w-[48rem] max-h-[60vh]"
        >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">{t('installed.health.title')}</h2>
                <Button variant="ghost" size="icon" onClick={onClose} className="-m-1">
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <Tabs.Root
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex flex-col flex-1 min-h-0"
            >
                <Tabs.List className="flex border-b border-border px-5 overflow-x-auto shrink-0">
                    {tabs.map((tabItem) => (
                        <Tabs.Trigger
                            key={tabItem.id}
                            value={tabItem.id}
                            className="relative text-xs px-2.5 py-3 border-b-2 border-transparent transition-colors text-text-subtle hover:text-text-muted before:content-[''] before:absolute before:inset-x-1 before:inset-y-1.5 before:rounded before:transition-colors hover:before:bg-surface-hover data-[state=active]:border-accent data-[state=active]:text-accent focus:outline-none whitespace-nowrap"
                        >
                            <span className="relative">{tabItem.label}</span>
                        </Tabs.Trigger>
                    ))}
                </Tabs.List>

                <div className="overflow-y-auto flex-1 p-3">
                    {showDepsTab && (
                        <Tabs.Content
                            value="deps"
                            className="focus:outline-none flex flex-col gap-0.5"
                        >
                            {missingDeps.length === 0 ? (
                                <EmptyTab>{t('installed.health.noMissingDeps')}</EmptyTab>
                            ) : (
                                missingDeps.map((item) => {
                                    const resolvable = item.missingDeps?.find(
                                        (d): d is MissingDepRef & { id: number } => d.id !== null
                                    )
                                    const isInstalling = installingDepId === resolvable?.id
                                    return (
                                        <HealthRow
                                            key={item.uid}
                                            thumbnailFile={modData.get(item.id)?.thumbnail?.file}
                                            name={item.name}
                                            secondary={
                                                item.missingDeps?.length
                                                    ? t('installed.health.missingDepsHint', {
                                                          deps: item.missingDeps
                                                              .map((d) => d.name)
                                                              .join(', '),
                                                      })
                                                    : undefined
                                            }
                                            clickable
                                            onOpen={() => onOpenDetail(item.id)}
                                            action={
                                                resolvable ? (
                                                    <Button
                                                        variant="accent"
                                                        size="sm"
                                                        disabled={
                                                            !gamePath ||
                                                            isInstalling ||
                                                            installingAll
                                                        }
                                                        onClick={() =>
                                                            void installDep(resolvable.id)
                                                        }
                                                        className="px-2.5 shrink-0"
                                                    >
                                                        {isInstalling
                                                            ? t('common.installing')
                                                            : t('installed.health.installDep')}
                                                    </Button>
                                                ) : undefined
                                            }
                                        />
                                    )
                                })
                            )}
                        </Tabs.Content>
                    )}
                    <Tabs.Content
                        value="missing"
                        className="focus:outline-none flex flex-col gap-0.5"
                    >
                        {missingItems.length === 0 ? (
                            <EmptyTab>{t('installed.health.noMissingFiles')}</EmptyTab>
                        ) : (
                            missingItems.map((item) => (
                                <HealthRow
                                    key={item.uid}
                                    thumbnailFile={modData.get(item.id)?.thumbnail?.file}
                                    name={item.name}
                                    secondary={t('installed.health.missingFileHint')}
                                    clickable={item.id >= 0}
                                    onOpen={item.id >= 0 ? () => onOpenDetail(item.id) : undefined}
                                    action={
                                        <button
                                            onClick={() => onReinstall(item.mods)}
                                            className="text-xs px-2.5 py-1 rounded bg-surface-active hover:bg-surface-light shrink-0 transition-colors"
                                        >
                                            {t('common.reinstall')}
                                        </button>
                                    }
                                />
                            ))
                        )}
                    </Tabs.Content>
                    <Tabs.Content
                        value="broken"
                        className="focus:outline-none flex flex-col gap-0.5"
                    >
                        {brokenItems.length === 0 ? (
                            <EmptyTab>{t('installed.health.noBrokenArchives')}</EmptyTab>
                        ) : (
                            brokenItems.map((item) => (
                                <HealthRow
                                    key={item.uid}
                                    thumbnailFile={modData.get(item.id)?.thumbnail?.file}
                                    name={item.name}
                                    secondary={t('installed.health.brokenArchiveHint')}
                                    clickable={item.id >= 0}
                                    onOpen={item.id >= 0 ? () => onOpenDetail(item.id) : undefined}
                                    action={
                                        <button
                                            onClick={() => onReinstall(item.mods)}
                                            className="text-xs px-2.5 py-1 rounded bg-surface-active hover:bg-surface-light shrink-0 transition-colors"
                                        >
                                            {t('common.reinstall')}
                                        </button>
                                    }
                                />
                            ))
                        )}
                    </Tabs.Content>
                    <Tabs.Content
                        value="outdated"
                        className="focus:outline-none flex flex-col gap-0.5"
                    >
                        {outdatedItems.length === 0 ? (
                            <EmptyTab>{t('installed.health.noOutdated')}</EmptyTab>
                        ) : (
                            outdatedItems.map((item) => (
                                <HealthRow
                                    key={item.uid}
                                    thumbnailFile={modData.get(item.id)?.thumbnail?.file}
                                    name={item.name}
                                    secondary={t('installed.health.outdatedHint')}
                                    clickable
                                    onOpen={() => onOpenDetail(item.id)}
                                    action={
                                        <button
                                            onClick={() => onReinstall(item.mods)}
                                            className="text-xs px-2.5 py-1 rounded bg-surface-active hover:bg-surface-light shrink-0 transition-colors"
                                        >
                                            {t('common.reinstall')}
                                        </button>
                                    }
                                />
                            ))
                        )}
                    </Tabs.Content>
                    <Tabs.Content
                        value="unidentified"
                        className="focus:outline-none flex flex-col gap-0.5"
                    >
                        {unidentifiedItems.length === 0 ? (
                            <EmptyTab>{t('installed.health.noUnidentified')}</EmptyTab>
                        ) : (
                            unidentifiedItems.map((item) => (
                                <HealthRow
                                    key={item.uid}
                                    name={item.name}
                                    secondary={t('installed.health.unidentifiedRowHint')}
                                />
                            ))
                        )}
                    </Tabs.Content>
                    <Tabs.Content
                        value="updates"
                        className="focus:outline-none flex flex-col gap-0.5"
                    >
                        {updatable.length === 0 ? (
                            <EmptyTab>{t('installed.health.noUpdates')}</EmptyTab>
                        ) : (
                            updatable.map((ins) => {
                                const apiMod = modData.get(ins.id)
                                return apiMod ? (
                                    <UpdateRow
                                        key={ins.uid}
                                        ins={ins}
                                        apiMod={apiMod}
                                        onOpenDetail={onOpenDetail}
                                    />
                                ) : null
                            })
                        )}
                    </Tabs.Content>
                </div>
            </Tabs.Root>

            <div className="flex items-center gap-3 px-5 py-4 border-t border-border shrink-0">
                {activeTab === 'deps' &&
                    missingDeps.some((item) => item.missingDeps?.some((d) => d.id !== null)) && (
                        <>
                            {depInstallError && (
                                <span className="text-xs text-danger-text truncate">
                                    {depInstallError}
                                </span>
                            )}
                            <Button
                                variant="accent"
                                size="md"
                                disabled={!gamePath || installingAll || installingDepId !== null}
                                onClick={() => void installAllDeps()}
                            >
                                {installingAll
                                    ? t('common.installing')
                                    : t('installed.health.installAllDeps')}
                            </Button>
                        </>
                    )}
                {activeTab === 'missing' && missingItems.length > 0 && (
                    <Button
                        variant="accent"
                        size="md"
                        onClick={() => {
                            missingItems.forEach((item) => onReinstall(item.mods))
                            onClose()
                        }}
                    >
                        {t('installed.health.reinstallAll')}
                    </Button>
                )}
                {activeTab === 'broken' && brokenItems.length > 0 && (
                    <Button
                        variant="accent"
                        size="md"
                        onClick={() => {
                            brokenItems.forEach((item) => onReinstall(item.mods))
                            onClose()
                        }}
                    >
                        {t('installed.health.reinstallAll')}
                    </Button>
                )}
                {activeTab === 'outdated' && outdatedItems.length > 0 && (
                    <Button
                        variant="accent"
                        size="md"
                        onClick={() => {
                            outdatedItems.forEach((item) => onReinstall(item.mods))
                            onClose()
                        }}
                    >
                        {t('installed.health.reinstallAll')}
                    </Button>
                )}
                {activeTab === 'updates' && updatable.length > 0 && (
                    <Button variant="accent" size="md" onClick={onReviewUpdates}>
                        {t('installed.reviewUpdates')}
                    </Button>
                )}
                <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">
                    {t('common.close')}
                </Button>
            </div>
        </Dialog>
    )
}
