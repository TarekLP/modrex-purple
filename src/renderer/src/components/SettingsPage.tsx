import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Button } from './ui/Button'
import {
    FolderOpen,
    Loader,
    RefreshCw,
    ScrollText,
    Gamepad2,
    AppWindow,
    Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { t } from '../i18n'
import { Select } from './Select'
import { Toggle } from './Toggle'
import { TelemetryConsentDialog } from './TelemetryConsentDialog'
import { api } from '../api'
import type { GameSettings } from '../api'
import { getSettingsCache, setSettingsCache, patchSettingsCache } from '../settingsCache'
import type { GameId } from '../../../shared/types'
import { GAMES } from '../../../shared/types'
import SteamIcon from '../../../../assets/icons/steam.svg?react'
import EpicIcon from '../../../../assets/icons/epicgames.svg?react'
import XboxIcon from '../../../../assets/icons/xbox.svg?react'

const iconClass = 'w-3.5 h-3.5 shrink-0 fill-current'

const LAUNCHER_OPTIONS = [
    { value: 'steam', label: 'Steam', icon: <SteamIcon className={iconClass} /> },
    { value: 'epic', label: 'Epic Games', icon: <EpicIcon className={iconClass} /> },
    { value: 'xbox', label: 'Xbox', icon: <XboxIcon className={iconClass} /> },
]

type SettingsTab = 'game' | 'application' | 'advanced'

const GAME_TAB_KEY = 'modrex:settings-tab'
const GLOBAL_TAB_KEY = 'modrex:settings-tab:global'

function readSavedTab(globalOnly: boolean): SettingsTab {
    const saved = localStorage.getItem(globalOnly ? GLOBAL_TAB_KEY : GAME_TAB_KEY)
    if (globalOnly) {
        return saved === 'application' || saved === 'advanced' ? saved : 'application'
    }
    return saved === 'game' || saved === 'application' || saved === 'advanced' ? saved : 'game'
}

const NAV_ITEMS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
    { id: 'game', label: t('settings.nav.game'), icon: Gamepad2 },
    { id: 'application', label: t('settings.nav.application'), icon: AppWindow },
    { id: 'advanced', label: t('settings.nav.advanced'), icon: Wrench },
]

function Section({
    title,
    description,
    children,
}: {
    title: string
    description?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="text-xs text-text-subtle">{description}</p>}
            {children}
        </section>
    )
}

interface Props {
    activeGame: GameId
    gamePath: string | null
    gamePathReady: boolean
    onGamePathChange: () => Promise<void>
    analyticsConsent: boolean | null
    onAnalyticsConsent: (enabled: boolean) => void
    discordPresenceEnabled: boolean
    onDiscordPresenceEnabled: (enabled: boolean) => void
    globalOnly?: boolean
}

function effectiveLauncher(gs: GameSettings, installed: string[]): string {
    const saved = gs.launcher ?? installed[0] ?? 'steam'
    return installed.length > 0 && !installed.includes(saved) ? installed[0] : saved
}

export function SettingsPage({
    activeGame,
    gamePath,
    gamePathReady,
    onGamePathChange,
    analyticsConsent,
    onAnalyticsConsent,
    discordPresenceEnabled,
    onDiscordPresenceEnabled,
    globalOnly = false,
}: Props) {
    const [settings, setSettings] = useState<GameSettings | null>(
        () => getSettingsCache(activeGame)?.settings ?? null
    )
    const [picking, setPicking] = useState(false)
    const [pathError, setPathError] = useState<string | null>(null)
    const [checkState, setCheckState] = useState<'idle' | 'checking' | 'upToDate'>('idle')
    const [launcher, setLauncher] = useState(() => {
        const cached = getSettingsCache(activeGame)
        return cached ? effectiveLauncher(cached.settings, cached.installedLaunchers) : 'steam'
    })
    const [installedLaunchers, setInstalledLaunchers] = useState<string[]>(
        () => getSettingsCache(activeGame)?.installedLaunchers ?? []
    )
    const [launchOptions, setLaunchOptions] = useState(
        () => getSettingsCache(activeGame)?.settings.launchOptions ?? ''
    )
    const launchOptionsLoaded = useRef(false)
    const [crimeBossInstallMode, setCrimeBossInstallMode] = useState(
        () => getSettingsCache(activeGame)?.settings.crimebossInstallMode ?? 'auto'
    )
    const [suppressCrashReporter, setSuppressCrashReporter] = useState(
        () => getSettingsCache(activeGame)?.settings.suppressCrashReporter === true
    )
    const [showAnalyticsDetails, setShowAnalyticsDetails] = useState(false)
    const [activeTab, setActiveTabState] = useState<SettingsTab>(() => readSavedTab(globalOnly))

    useEffect(() => {
        setActiveTabState(readSavedTab(globalOnly))
    }, [globalOnly])

    function setActiveTab(tab: SettingsTab) {
        setActiveTabState(tab)
        localStorage.setItem(globalOnly ? GLOBAL_TAB_KEY : GAME_TAB_KEY, tab)
    }

    useEffect(() => {
        launchOptionsLoaded.current = false
        let cancelled = false
        const cached = getSettingsCache(activeGame)
        const launchers = cached
            ? Promise.resolve(cached.installedLaunchers)
            : api.getInstalledLaunchers(activeGame)
        Promise.all([api.getGameSettings(activeGame), launchers]).then(([gs, installed]) => {
            setSettingsCache(activeGame, { settings: gs, installedLaunchers: installed })
            if (cancelled) return
            setInstalledLaunchers(installed)
            setSettings(gs)
            const effective = effectiveLauncher(gs, installed)
            setLauncher(effective)
            if (effective !== gs.launcher) api.setLauncher(effective, activeGame)
            setLaunchOptions(gs.launchOptions ?? '')
            launchOptionsLoaded.current = true
            setCrimeBossInstallMode(gs.crimebossInstallMode ?? 'auto')
            setSuppressCrashReporter(gs.suppressCrashReporter === true)
        })
        return () => {
            cancelled = true
        }
    }, [activeGame])

    useEffect(() => {
        if (!launchOptionsLoaded.current) return
        const timer = setTimeout(() => {
            api.setLaunchOptions(launchOptions, activeGame)
            patchSettingsCache(activeGame, { launchOptions })
        }, 500)
        return () => clearTimeout(timer)
    }, [launchOptions, activeGame])

    const availableLaunchers = LAUNCHER_OPTIONS.filter((o) => installedLaunchers.includes(o.value))

    async function handleBrowse() {
        setPicking(true)
        setPathError(null)
        try {
            const picked = await api.pickFolder()
            if (!picked) return
            try {
                await api.setGamePath(picked, activeGame)
                setSettings((s) => ({ ...s, gamePath: picked }))
                patchSettingsCache(activeGame, { gamePath: picked })
                await onGamePathChange()
            } catch {
                setPathError(t('settings.gamePath.invalid', { game: GAMES[activeGame].name }))
            }
        } finally {
            setPicking(false)
        }
    }

    async function handleCheckForUpdates() {
        setCheckState('checking')
        try {
            await api.checkForUpdates()
            setCheckState('upToDate')
            setTimeout(() => setCheckState('idle'), 3000)
        } catch {
            setCheckState('idle')
        }
    }

    async function handleLauncherChange(value: string) {
        setLauncher(value)
        patchSettingsCache(activeGame, { launcher: value })
        await api.setLauncher(value, activeGame)
    }

    async function handleCrimeBossInstallModeChange(value: string) {
        setCrimeBossInstallMode(value)
        patchSettingsCache(activeGame, { crimebossInstallMode: value })
        await api.setCrimeBossInstallMode(value)
    }

    async function handleSuppressCrashReporterChange(value: boolean) {
        setSuppressCrashReporter(value)
        patchSettingsCache(activeGame, { suppressCrashReporter: value })
        await api.setSuppressCrashReporter(value, activeGame)
    }

    if (settings === null) return null

    const visibleTabs = globalOnly ? NAV_ITEMS.filter((item) => item.id !== 'game') : NAV_ITEMS

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border shrink-0">
                <h1 className="text-lg font-semibold">{t('settings.title')}</h1>
                {!globalOnly && (
                    <p className="text-xs text-text-subtle mt-0.5">{GAMES[activeGame].name}</p>
                )}
            </div>

            <div className="flex-1 flex overflow-hidden">
                <nav className="w-44 border-r border-border shrink-0 flex flex-col gap-1 p-2">
                    {visibleTabs.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`w-full px-2 py-2 gap-2.5 flex items-center rounded text-sm transition-colors ${
                                activeTab === id
                                    ? 'bg-surface-active text-text'
                                    : 'text-text-muted hover:bg-surface-hover hover:text-text'
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{label}</span>
                        </button>
                    ))}
                </nav>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="max-w-xl flex flex-col gap-6">
                        {activeTab === 'game' && (
                            <>
                                <Section
                                    title={t('settings.gamePath.title')}
                                    description={t('settings.gamePath.description', {
                                        game: GAMES[activeGame].name,
                                    })}
                                >
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-hover border border-border mt-1">
                                        {!gamePathReady ? (
                                            <span className="text-sm flex-1 text-text-muted flex items-center gap-2">
                                                <Loader className="w-3.5 h-3.5 animate-spin shrink-0" />
                                                {t('settings.gamePath.detecting')}
                                            </span>
                                        ) : (
                                            <span className="text-sm font-mono truncate flex-1 text-text-muted">
                                                {gamePath ?? t('settings.gamePath.notFound')}
                                            </span>
                                        )}
                                        <div className="flex gap-2 shrink-0">
                                            <Button
                                                variant="accent"
                                                size="md"
                                                disabled={picking}
                                                onClick={handleBrowse}
                                            >
                                                <FolderOpen className="w-3.5 h-3.5" />
                                                {picking
                                                    ? t('settings.gamePath.picking')
                                                    : t('settings.gamePath.browse')}
                                            </Button>
                                        </div>
                                    </div>
                                    {pathError ? (
                                        <p className="text-xs text-danger-text">{pathError}</p>
                                    ) : !gamePathReady ? null : gamePath ? (
                                        <p className="text-xs text-success-text">
                                            {t('settings.gamePath.autoDetected')}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-danger-text">
                                            {t('settings.gamePath.notDetected', {
                                                game: GAMES[activeGame].name,
                                            })}
                                        </p>
                                    )}
                                </Section>

                                <Section
                                    title={t('settings.launcher.title')}
                                    description={t('settings.launcher.description', {
                                        game: GAMES[activeGame].name,
                                    })}
                                >
                                    <div className="mt-1">
                                        <Select
                                            value={launcher}
                                            onChange={handleLauncherChange}
                                            options={availableLaunchers}
                                            disabled={availableLaunchers.length <= 1}
                                        />
                                    </div>
                                </Section>

                                {activeGame === 'cb' && (
                                    <Section
                                        title={t('settings.crimeBossInstallMode.title')}
                                        description={t('settings.crimeBossInstallMode.description')}
                                    >
                                        <div className="mt-1">
                                            <Select
                                                value={crimeBossInstallMode}
                                                onChange={handleCrimeBossInstallModeChange}
                                                options={[
                                                    {
                                                        value: 'auto',
                                                        label: t(
                                                            'settings.crimeBossInstallMode.auto'
                                                        ),
                                                    },
                                                    {
                                                        value: 'ask',
                                                        label: t(
                                                            'settings.crimeBossInstallMode.ask'
                                                        ),
                                                    },
                                                ]}
                                            />
                                        </div>
                                    </Section>
                                )}

                                {activeGame === 'pd3' && launcher === 'xbox' && (
                                    <Section title={t('settings.crashReporter.title')}>
                                        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border mt-1">
                                            <span className="text-sm text-text-muted pr-4">
                                                {t('settings.crashReporter.description')}
                                            </span>
                                            <Toggle
                                                checked={suppressCrashReporter}
                                                onChange={handleSuppressCrashReporterChange}
                                                title={t('settings.crashReporter.title')}
                                            />
                                        </div>
                                    </Section>
                                )}

                                <Section title={t('settings.launchOptions.title')}>
                                    {activeGame === 'pd3' &&
                                        (launcher === 'xbox' ? (
                                            <p className="text-xs text-text-subtle">
                                                {t('settings.launchOptions.xboxNotePre')}{' '}
                                                <span className="font-mono text-text">
                                                    -fileopenlog
                                                </span>{' '}
                                                {t('settings.launchOptions.xboxNotePost')}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-text-subtle">
                                                {t('settings.launchOptions.descriptionPre')}{' '}
                                                <span className="font-mono text-text">
                                                    -fileopenlog
                                                </span>{' '}
                                                {t('settings.launchOptions.descriptionPost')}
                                            </p>
                                        ))}
                                    <input
                                        type="text"
                                        value={launchOptions}
                                        onChange={(e) => setLaunchOptions(e.target.value)}
                                        placeholder={
                                            activeGame === 'pd3'
                                                ? t('settings.launchOptions.placeholder')
                                                : ''
                                        }
                                        disabled={launcher === 'xbox'}
                                        className="text-sm font-mono px-3 py-2 rounded-lg bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                                    />
                                </Section>
                            </>
                        )}

                        {activeTab === 'application' && (
                            <>
                                <Section title={t('settings.updates.title')}>
                                    <div className="flex items-center gap-3 mt-1">
                                        <Button
                                            variant="secondary"
                                            size="md"
                                            disabled={checkState === 'checking'}
                                            onClick={handleCheckForUpdates}
                                        >
                                            <RefreshCw
                                                className={`w-3.5 h-3.5 ${checkState === 'checking' ? 'animate-spin' : ''}`}
                                            />
                                            {checkState === 'checking'
                                                ? t('settings.updates.checking')
                                                : t('settings.updates.check')}
                                        </Button>
                                        {checkState === 'upToDate' && (
                                            <span className="text-xs text-success-text">
                                                {t('settings.updates.upToDate')}
                                            </span>
                                        )}
                                    </div>
                                </Section>

                                <Section title={t('telemetry.settingsTitle')}>
                                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border mt-1">
                                        <span className="text-sm text-text-muted pr-4">
                                            {t('telemetry.settingsDescription')}
                                        </span>
                                        <Toggle
                                            checked={analyticsConsent === true}
                                            onChange={onAnalyticsConsent}
                                        />
                                    </div>
                                    <button
                                        onClick={() => setShowAnalyticsDetails(true)}
                                        className="text-xs text-accent hover:underline self-start"
                                    >
                                        {t('telemetry.detailsToggle')}
                                    </button>
                                </Section>

                                <Section title={t('telemetry.discordPresenceTitle')}>
                                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border mt-1">
                                        <span className="text-sm text-text-muted pr-4">
                                            {t('telemetry.discordPresenceDescription')}
                                        </span>
                                        <Toggle
                                            checked={discordPresenceEnabled}
                                            onChange={onDiscordPresenceEnabled}
                                        />
                                    </div>
                                </Section>
                            </>
                        )}

                        {activeTab === 'advanced' && (
                            <Section
                                title={t('settings.logs.title')}
                                description={t('settings.logs.description')}
                            >
                                <div className="mt-1">
                                    <Button
                                        variant="secondary"
                                        size="md"
                                        onClick={() => api.openLog()}
                                    >
                                        <ScrollText className="w-3.5 h-3.5" />
                                        {t('settings.logs.open')}
                                    </Button>
                                </div>
                            </Section>
                        )}
                    </div>
                </div>
            </div>

            <TelemetryConsentDialog
                open={showAnalyticsDetails}
                dismissable
                onClose={() => setShowAnalyticsDetails(false)}
                onChoice={(enabled) => {
                    onAnalyticsConsent(enabled)
                    setShowAnalyticsDetails(false)
                }}
            />
        </div>
    )
}
