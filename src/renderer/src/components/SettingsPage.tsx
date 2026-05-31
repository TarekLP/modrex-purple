import { useState, useEffect, useRef } from 'react'
import { FolderOpen, RefreshCw, ScrollText } from 'lucide-react'
import { t } from '../i18n'
import { Select } from './Select'
import { api } from '../api'
import SteamIcon from '../../../../assets/icons/steam.svg?react'
import EpicIcon from '../../../../assets/icons/epicgames.svg?react'
import XboxIcon from '../../../../assets/icons/xbox.svg?react'

const iconClass = 'w-3.5 h-3.5 shrink-0 fill-current'

const LAUNCHER_OPTIONS = [
    { value: 'steam', label: 'Steam', icon: <SteamIcon className={iconClass} /> },
    { value: 'epic', label: 'Epic Games', icon: <EpicIcon className={iconClass} /> },
    { value: 'xbox', label: 'Xbox', icon: <XboxIcon className={iconClass} /> },
]

interface Props {
    gamePath: string | null
    onGamePathChange: () => Promise<void>
}

export function SettingsPage({ gamePath, onGamePathChange }: Props) {
    const [settings, setSettings] = useState<{
        gamePath?: string
        launcher?: string
        launchOptions?: string
    } | null>(null)
    const [picking, setPicking] = useState(false)
    const [pathError, setPathError] = useState<string | null>(null)
    const [checkState, setCheckState] = useState<'idle' | 'checking' | 'upToDate'>('idle')
    const [launcher, setLauncher] = useState('steam')
    const [installedLaunchers, setInstalledLaunchers] = useState<string[]>([])
    const [launchOptions, setLaunchOptions] = useState('')
    const launchOptionsLoaded = useRef(false)

    useEffect(() => {
        Promise.all([api.getSettings(), api.getInstalledLaunchers()]).then(([s, installed]) => {
            setInstalledLaunchers(installed)
            setSettings(s)
            setLauncher(s.launcher ?? 'steam')
            setLaunchOptions(s.launchOptions ?? '')
            launchOptionsLoaded.current = true
        })
    }, [])

    useEffect(() => {
        if (!launchOptionsLoaded.current) return
        const timer = setTimeout(() => api.setLaunchOptions(launchOptions), 500)
        return () => clearTimeout(timer)
    }, [launchOptions])

    const availableLaunchers = LAUNCHER_OPTIONS.filter((o) => installedLaunchers.includes(o.value))

    async function handleBrowse() {
        setPicking(true)
        setPathError(null)
        try {
            const picked = await api.pickFolder()
            if (!picked) return
            try {
                await api.setGamePath(picked)
                setSettings((s) => ({ ...s, gamePath: picked }))
                await onGamePathChange()
            } catch {
                setPathError(t('settings.gamePath.invalid'))
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
        await api.setLauncher(value)
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border shrink-0">
                <h1 className="text-lg font-semibold">{t('settings.title')}</h1>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
                <section className="max-w-xl flex flex-col gap-2">
                    <h2 className="text-sm font-semibold">{t('settings.gamePath.title')}</h2>
                    <p className="text-xs text-text-subtle">{t('settings.gamePath.description')}</p>

                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-hover border border-border mt-1">
                        <span className="text-sm font-mono truncate flex-1 text-text-muted">
                            {gamePath ?? t('settings.gamePath.notFound')}
                        </span>
                        <div className="flex gap-2 shrink-0">
                            <button
                                disabled={picking}
                                onClick={handleBrowse}
                                className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                            >
                                <FolderOpen className="w-3.5 h-3.5" />
                                {picking
                                    ? t('settings.gamePath.picking')
                                    : t('settings.gamePath.browse')}
                            </button>
                        </div>
                    </div>

                    {pathError ? (
                        <p className="text-xs text-danger-text">{pathError}</p>
                    ) : gamePath ? (
                        <p className="text-xs text-success-text">
                            {t('settings.gamePath.autoDetected')}
                        </p>
                    ) : (
                        <p className="text-xs text-danger-text">
                            {t('settings.gamePath.notDetected')}
                        </p>
                    )}
                </section>

                <section className="max-w-xl flex flex-col gap-2 mt-6">
                    <h2 className="text-sm font-semibold">{t('settings.launcher.title')}</h2>
                    <p className="text-xs text-text-subtle">{t('settings.launcher.description')}</p>
                    <div className="mt-1">
                        <Select
                            value={launcher}
                            onChange={handleLauncherChange}
                            options={availableLaunchers}
                            disabled={availableLaunchers.length <= 1}
                        />
                    </div>
                </section>

                <section className="max-w-xl flex flex-col gap-2 mt-6">
                    <h2 className="text-sm font-semibold">{t('settings.updates.title')}</h2>
                    <div className="flex items-center gap-3 mt-1">
                        <button
                            disabled={checkState === 'checking'}
                            onClick={handleCheckForUpdates}
                            className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                        >
                            <RefreshCw
                                className={`w-3.5 h-3.5 ${checkState === 'checking' ? 'animate-spin' : ''}`}
                            />
                            {checkState === 'checking'
                                ? t('settings.updates.checking')
                                : t('settings.updates.check')}
                        </button>
                        {checkState === 'upToDate' && (
                            <span className="text-xs text-success-text">
                                {t('settings.updates.upToDate')}
                            </span>
                        )}
                    </div>
                </section>

                <section className="max-w-xl flex flex-col gap-2 mt-6">
                    <h2 className="text-sm font-semibold">{t('settings.logs.title')}</h2>
                    <p className="text-xs text-text-subtle">{t('settings.logs.description')}</p>
                    <div className="mt-1">
                        <button
                            onClick={() => api.openLog()}
                            className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active transition-colors flex items-center gap-1.5"
                        >
                            <ScrollText className="w-3.5 h-3.5" />
                            {t('settings.logs.open')}
                        </button>
                    </div>
                </section>

                {settings !== null && (
                    <section className="max-w-xl flex flex-col gap-2 mt-6">
                        <h2 className="text-sm font-semibold">
                            {t('settings.launchOptions.title')}
                        </h2>
                        {launcher === 'xbox' ? (
                            <p className="text-xs text-text-subtle">
                                {t('settings.launchOptions.xboxNotePre')}{' '}
                                <span className="font-mono text-text">-fileopenlog</span>{' '}
                                {t('settings.launchOptions.xboxNotePost')}
                            </p>
                        ) : (
                            <p className="text-xs text-text-subtle">
                                {t('settings.launchOptions.descriptionPre')}{' '}
                                <span className="font-mono text-text">-fileopenlog</span>{' '}
                                {t('settings.launchOptions.descriptionPost')}
                            </p>
                        )}
                        <input
                            type="text"
                            value={launchOptions}
                            onChange={(e) => setLaunchOptions(e.target.value)}
                            placeholder={t('settings.launchOptions.placeholder')}
                            disabled={launcher === 'xbox'}
                            className="text-sm font-mono px-3 py-2 rounded-lg bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                        />
                    </section>
                )}
            </div>
        </div>
    )
}
