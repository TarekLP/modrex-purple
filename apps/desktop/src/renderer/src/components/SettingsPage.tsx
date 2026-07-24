import { useState, useEffect, useRef, type ReactNode } from 'react'
import { BetaBadge } from './BetaBadge'
import { TITLE_ROW_MIN_H } from './pageHeader'
import { Button } from './ui/Button'
import {
    FolderOpen,
    Loader,
    RefreshCw,
    ScrollText,
    Gamepad2,
    AppWindow,
    Wrench,
    Heart,
    Globe,
    Info,
    TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { siGithub, siDiscord } from 'simple-icons'
import { t } from '../i18n'
import { Select } from './Select'
import { Dialog, DialogHeader } from './Dialog'
import { Toggle } from './Toggle'
import { SkeletonBar } from './Skeleton'
import { TelemetryConsentDialog } from './TelemetryConsentDialog'
import { StorageSettings } from './StorageSettings'
import { api } from '../api'
import type { GameSettings } from '../api'
import { getSettingsCache, setSettingsCache, patchSettingsCache } from '../settingsCache'
import type { GameId } from '../../../shared/types'
import { GAMES } from '../../../shared/types'
import SteamIcon from '../../../../assets/icons/steam.svg?react'
import EpicIcon from '../../../../assets/icons/epicgames.svg?react'
import XboxIcon from '../../../../assets/icons/xbox.svg?react'

const iconClass = 'w-3.5 h-3.5 shrink-0 fill-current'

const APP_VERSION = import.meta.env.DEV ? 'v-dev' : `v${import.meta.env.VITE_APP_VERSION}`

const GITHUB_URL = 'https://github.com/modrexio/modrex'
const SPONSOR_URL = 'https://github.com/sponsors/modrexio'
const DISCORD_URL = 'https://discord.gg/tenzpx8JRM'
const WEBSITE_URL = 'https://modrex.net/'

const LAUNCHER_OPTIONS = [
    { value: 'steam', label: 'Steam', icon: <SteamIcon className={iconClass} /> },
    { value: 'epic', label: 'Epic Games', icon: <EpicIcon className={iconClass} /> },
    { value: 'xbox', label: 'Xbox', icon: <XboxIcon className={iconClass} /> },
]

const FOLDER_LABELS: Record<string, string> = {
    mods: t('settings.folders.mods'),
    modkitMods: t('settings.folders.modkitMods'),
    legacyPaks: t('settings.folders.legacyPaks'),
    overrides: t('settings.folders.overrides'),
    ue4ssMods: t('settings.folders.ue4ssMods'),
}

type SettingsTab = 'game' | 'application' | 'advanced' | 'about'

const GAME_TAB_KEY = 'modrex:settings-tab'
const GLOBAL_TAB_KEY = 'modrex:settings-tab:global'

// For navigation into a specific tab from outside the page: the page re-reads
// the saved tab on every activation, so writing before switching views lands there.
export function saveSettingsTab(tab: SettingsTab) {
    localStorage.setItem(GAME_TAB_KEY, tab)
}

function readSavedTab(globalOnly: boolean): SettingsTab {
    const saved = localStorage.getItem(globalOnly ? GLOBAL_TAB_KEY : GAME_TAB_KEY)
    if (globalOnly) {
        return saved === 'application' || saved === 'advanced' || saved === 'about'
            ? saved
            : 'application'
    }
    return saved === 'game' || saved === 'application' || saved === 'advanced' || saved === 'about'
        ? saved
        : 'game'
}

const NAV_ITEMS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
    { id: 'game', label: t('settings.nav.game'), icon: Gamepad2 },
    { id: 'application', label: t('settings.nav.application'), icon: AppWindow },
    { id: 'advanced', label: t('settings.nav.advanced'), icon: Wrench },
    { id: 'about', label: t('settings.nav.about'), icon: Info },
]

function SettingsSkeleton() {
    return (
        <div className="flex flex-col gap-6 animate-pulse" aria-hidden="true">
            {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                    <SkeletonBar className="h-3 w-32" />
                    <SkeletonBar className="h-2.5 w-2/3" />
                    <SkeletonBar className="h-11 w-full rounded-lg mt-1" />
                </div>
            ))}
        </div>
    )
}

function Section({
    title,
    badge,
    description,
    children,
}: {
    title: string
    badge?: ReactNode
    description?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{title}</h2>
                {badge}
            </div>
            {description && <p className="text-xs text-text-subtle">{description}</p>}
            {children}
        </section>
    )
}

interface Props {
    activeGame: GameId
    isActive: boolean
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
    isActive,
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
    const [installedLaunchersReady, setInstalledLaunchersReady] = useState(
        () => getSettingsCache(activeGame) !== undefined
    )
    const [launchOptions, setLaunchOptions] = useState(
        () => getSettingsCache(activeGame)?.settings.launchOptions ?? ''
    )
    const requiredLaunchFlag = GAMES[activeGame].requiredLaunchFlag
    const launchOptionsLoaded = useRef(false)
    const [crimeBossInstallMode, setCrimeBossInstallMode] = useState(
        () => getSettingsCache(activeGame)?.settings.crimebossInstallMode ?? 'auto'
    )
    const [suppressCrashReporter, setSuppressCrashReporter] = useState(
        () => getSettingsCache(activeGame)?.settings.suppressCrashReporter === true
    )
    const [showAnalyticsDetails, setShowAnalyticsDetails] = useState(false)
    const [activeTab, setActiveTabState] = useState<SettingsTab>(() => readSavedTab(globalOnly))
    const [nexusSignedIn, setNexusSignedIn] = useState<boolean | null>(null)
    const [nexusSignInError, setNexusSignInError] = useState<string | null>(null)
    const [secretStoreAvailable, setSecretStoreAvailable] = useState<boolean | null>(null)
    const [confirmNexusSignOut, setConfirmNexusSignOut] = useState(false)
    const [modFolders, setModFolders] = useState<{ tag: string; labelKey: string }[]>([])

    // Re-read on activation, not just mount: the page stays mounted as a hidden
    // pane, and other pages can request a tab via saveSettingsTab before navigating.
    useEffect(() => {
        if (isActive) setActiveTabState(readSavedTab(globalOnly))
    }, [isActive, globalOnly])

    useEffect(() => {
        api.listModFolders(activeGame).then(setModFolders)
    }, [activeGame])

    function setActiveTab(tab: SettingsTab) {
        setActiveTabState(tab)
        localStorage.setItem(globalOnly ? GLOBAL_TAB_KEY : GAME_TAB_KEY, tab)
    }

    // getGameSettings is a plain settings.json read (near-instant); getInstalledLaunchers
    // probes every store's registry/VDF/manifests (can take seconds). Fetching them
    // separately means the page only waits on the fast read, not the probe.
    useEffect(() => {
        launchOptionsLoaded.current = false
        let cancelled = false

        api.getGameSettings(activeGame).then((gs) => {
            if (cancelled) return
            setSettings(gs)
            setLaunchOptions(gs.launchOptions ?? '')
            launchOptionsLoaded.current = true
            setCrimeBossInstallMode(gs.crimebossInstallMode ?? 'auto')
            setSuppressCrashReporter(gs.suppressCrashReporter === true)
        })

        const cached = getSettingsCache(activeGame)
        setInstalledLaunchersReady(cached !== undefined)
        const launchers = cached
            ? Promise.resolve(cached.installedLaunchers)
            : api.getInstalledLaunchers(activeGame)
        launchers.then((installed) => {
            if (cancelled) return
            setInstalledLaunchers(installed)
            setInstalledLaunchersReady(true)
        })

        return () => {
            cancelled = true
        }
    }, [activeGame])

    // Only reconciles the saved launcher once both halves above have landed —
    // installedLaunchers is an empty array both while loading and when genuinely
    // empty, so installedLaunchersReady is what tells those two states apart.
    useEffect(() => {
        if (!settings || !installedLaunchersReady) return
        setSettingsCache(activeGame, { settings, installedLaunchers })
        const effective = effectiveLauncher(settings, installedLaunchers)
        setLauncher(effective)
        if (effective !== settings.launcher) api.setLauncher(effective, activeGame)
    }, [settings, installedLaunchers, installedLaunchersReady, activeGame])

    useEffect(() => {
        if (!launchOptionsLoaded.current) return
        const timer = setTimeout(() => {
            api.setLaunchOptions(launchOptions, activeGame)
            patchSettingsCache(activeGame, { launchOptions })
        }, 500)
        return () => clearTimeout(timer)
    }, [launchOptions, activeGame])

    useEffect(() => {
        let cancelled = false
        api.isNexusSignedIn().then((signedIn) => {
            if (!cancelled) setNexusSignedIn(signedIn)
        })
        // Not tied to sign-in state: this reflects a static OS fact, checked once
        // per session, so the warning below is accurate even for an existing session.
        api.secretStoreAvailable().then((available) => {
            if (!cancelled) setSecretStoreAvailable(available)
        })
        const offSignedIn = api.onNexusOAuthSignedIn(() => {
            setNexusSignedIn(true)
            setNexusSignInError(null)
        })
        const offFailed = api.onNexusOAuthFailed((error) => setNexusSignInError(error))
        return () => {
            cancelled = true
            offSignedIn()
            offFailed()
        }
    }, [])

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

    function handleNexusSignIn() {
        setNexusSignInError(null)
        api.nexusOAuthStart()
    }

    async function handleNexusSignOut() {
        setConfirmNexusSignOut(false)
        await api.nexusSignOut()
        setNexusSignedIn(false)
    }

    const visibleTabs = globalOnly ? NAV_ITEMS.filter((item) => item.id !== 'game') : NAV_ITEMS

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border shrink-0">
                <div className={`flex flex-col justify-center ${TITLE_ROW_MIN_H}`}>
                    <h1 className="text-lg font-semibold">{t('settings.title')}</h1>
                    {!globalOnly && (
                        <p className="text-xs text-text-subtle mt-0.5">{GAMES[activeGame].name}</p>
                    )}
                </div>
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
                        {settings === null ? (
                            <SettingsSkeleton />
                        ) : (
                            <>
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
                                                        {gamePath ??
                                                            t('settings.gamePath.notFound')}
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
                                                <p className="text-xs text-danger-text">
                                                    {pathError}
                                                </p>
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
                                                {!installedLaunchersReady ? (
                                                    <span className="text-sm text-text-muted flex items-center gap-2">
                                                        <Loader className="w-3.5 h-3.5 animate-spin shrink-0" />
                                                        {t('settings.launcher.detecting')}
                                                    </span>
                                                ) : (
                                                    <Select
                                                        value={launcher}
                                                        onChange={handleLauncherChange}
                                                        options={availableLaunchers}
                                                        disabled={availableLaunchers.length <= 1}
                                                    />
                                                )}
                                            </div>
                                        </Section>

                                        {activeGame === 'cb' && (
                                            <Section
                                                title={t('settings.crimeBossInstallMode.title')}
                                                description={t(
                                                    'settings.crimeBossInstallMode.description'
                                                )}
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
                                            {requiredLaunchFlag &&
                                                (launcher === 'xbox' ? (
                                                    <p className="text-xs text-text-subtle">
                                                        {t('settings.launchOptions.xboxNotePre')}{' '}
                                                        <span className="font-mono text-text">
                                                            {requiredLaunchFlag}
                                                        </span>{' '}
                                                        {t('settings.launchOptions.xboxNotePost')}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-text-subtle">
                                                        {t('settings.launchOptions.descriptionPre')}{' '}
                                                        <span className="font-mono text-text">
                                                            {requiredLaunchFlag}
                                                        </span>{' '}
                                                        {t(
                                                            'settings.launchOptions.descriptionPost'
                                                        )}
                                                    </p>
                                                ))}
                                            <input
                                                type="text"
                                                value={launchOptions}
                                                onChange={(e) => setLaunchOptions(e.target.value)}
                                                placeholder={requiredLaunchFlag ?? ''}
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

                                {activeTab === 'about' && (
                                    <>
                                        <div className="flex flex-col items-center gap-1 py-6 text-center">
                                            <span
                                                style={{
                                                    fontFamily: "'Bebas Neue', sans-serif",
                                                    fontSize: '3rem',
                                                    letterSpacing: '0.05em',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                <span style={{ color: 'var(--color-text)' }}>
                                                    MOD
                                                </span>
                                                <span style={{ color: 'var(--color-accent)' }}>
                                                    REX
                                                </span>
                                            </span>
                                            <span className="text-xs text-text-subtle">
                                                {APP_VERSION}
                                            </span>
                                            <p className="text-sm text-text-muted mt-2">
                                                {t('settings.about.tagline')}
                                            </p>
                                        </div>

                                        <Section title={t('settings.about.supportTitle')}>
                                            <div className="flex flex-col gap-3 px-4 py-3 rounded-lg border border-border bg-surface-raised mt-1">
                                                <p className="text-sm text-text-muted">
                                                    {t('settings.about.supportBody')}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        variant="accent"
                                                        size="md"
                                                        onClick={() =>
                                                            api.openExternal(SPONSOR_URL)
                                                        }
                                                    >
                                                        <Heart className="w-3.5 h-3.5 shrink-0" />
                                                        {t('settings.about.sponsor')}
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        size="md"
                                                        onClick={() => api.openExternal(GITHUB_URL)}
                                                    >
                                                        <svg
                                                            viewBox="0 0 24 24"
                                                            className={iconClass}
                                                            aria-hidden
                                                        >
                                                            <path d={siGithub.path} />
                                                        </svg>
                                                        {t('settings.about.star')}
                                                    </Button>
                                                </div>
                                            </div>
                                        </Section>

                                        <Section title={t('settings.about.communityTitle')}>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                <Button
                                                    variant="secondary"
                                                    size="md"
                                                    onClick={() => api.openExternal(DISCORD_URL)}
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        className={iconClass}
                                                        aria-hidden
                                                    >
                                                        <path d={siDiscord.path} />
                                                    </svg>
                                                    {t('settings.about.discord')}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="md"
                                                    onClick={() => api.openExternal(WEBSITE_URL)}
                                                >
                                                    <Globe className="w-3.5 h-3.5 shrink-0" />
                                                    {t('settings.about.website')}
                                                </Button>
                                            </div>
                                        </Section>

                                        <p className="text-xs text-text-subtle">
                                            {t('settings.about.disclaimer')}
                                        </p>
                                    </>
                                )}

                                {activeTab === 'advanced' && (
                                    <>
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

                                        <Section
                                            title={t('settings.nexusAccount.title')}
                                            badge={<BetaBadge />}
                                            description={t('settings.nexusAccount.description')}
                                        >
                                            <div className="flex items-center gap-3 mt-1">
                                                {nexusSignedIn === true ? (
                                                    <>
                                                        <span className="text-xs text-success-text">
                                                            {t('settings.nexusAccount.signedIn')}
                                                        </span>
                                                        <Button
                                                            variant="secondary"
                                                            size="md"
                                                            onClick={() =>
                                                                setConfirmNexusSignOut(true)
                                                            }
                                                        >
                                                            {t('settings.nexusAccount.signOut')}
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button
                                                        variant="accent"
                                                        size="md"
                                                        onClick={handleNexusSignIn}
                                                    >
                                                        {t('settings.nexusAccount.signIn')}
                                                    </Button>
                                                )}
                                            </div>
                                            {nexusSignInError !== null && (
                                                <p className="text-xs text-danger-text">
                                                    {t('settings.nexusAccount.failed', {
                                                        error: nexusSignInError,
                                                    })}
                                                </p>
                                            )}
                                            {nexusSignedIn === true &&
                                                secretStoreAvailable === false && (
                                                    <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
                                                        <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        <span>
                                                            {t(
                                                                'settings.nexusAccount.insecureStorage'
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                            <Dialog
                                                open={confirmNexusSignOut}
                                                onOpenChange={(open) =>
                                                    !open && setConfirmNexusSignOut(false)
                                                }
                                                title={t(
                                                    'settings.nexusAccount.signOutConfirmTitle'
                                                )}
                                                className="w-80"
                                            >
                                                <DialogHeader
                                                    title={t(
                                                        'settings.nexusAccount.signOutConfirmTitle'
                                                    )}
                                                    subtitle={t(
                                                        'settings.nexusAccount.signOutConfirmBody'
                                                    )}
                                                    onClose={() => setConfirmNexusSignOut(false)}
                                                    wrapSubtitle
                                                />
                                                <div className="flex items-center justify-end gap-2 px-5 py-4 shrink-0">
                                                    <Button
                                                        variant="secondary"
                                                        size="md"
                                                        onClick={() =>
                                                            setConfirmNexusSignOut(false)
                                                        }
                                                    >
                                                        {t('common.cancel')}
                                                    </Button>
                                                    <Button
                                                        variant="accent"
                                                        size="md"
                                                        onClick={handleNexusSignOut}
                                                    >
                                                        {t('settings.nexusAccount.signOutConfirm')}
                                                    </Button>
                                                </div>
                                            </Dialog>
                                        </Section>
                                        <Section
                                            title={t('settings.folders.title')}
                                            description={t('settings.folders.description')}
                                        >
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                {!globalOnly && gamePath && (
                                                    <>
                                                        <Button
                                                            variant="secondary"
                                                            size="md"
                                                            onClick={() => api.openPath(gamePath)}
                                                        >
                                                            <FolderOpen className="w-3.5 h-3.5" />
                                                            {t('settings.folders.gameFolder')}
                                                        </Button>
                                                        {modFolders.map((f) => (
                                                            <Button
                                                                key={f.tag}
                                                                variant="secondary"
                                                                size="md"
                                                                onClick={() =>
                                                                    api.openModFolder(
                                                                        activeGame,
                                                                        f.tag
                                                                    )
                                                                }
                                                            >
                                                                <FolderOpen className="w-3.5 h-3.5" />
                                                                {t('settings.folders.open', {
                                                                    name:
                                                                        FOLDER_LABELS[f.labelKey] ??
                                                                        f.labelKey,
                                                                })}
                                                            </Button>
                                                        ))}
                                                    </>
                                                )}
                                                <Button
                                                    variant="secondary"
                                                    size="md"
                                                    onClick={() => api.openDataFolder()}
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5" />
                                                    {t('settings.folders.dataFolder')}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="md"
                                                    onClick={() => api.openAppFolder()}
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5" />
                                                    {t('settings.folders.appFolder')}
                                                </Button>
                                            </div>
                                        </Section>

                                        <StorageSettings />
                                    </>
                                )}
                            </>
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
