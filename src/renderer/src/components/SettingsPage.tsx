import { useState, useEffect, useRef } from 'react'

interface Props {
    gamePath: string | null
    onGamePathChange: () => Promise<void>
}

export function SettingsPage({ gamePath, onGamePathChange }: Props) {
    const [settings, setSettings] = useState<{ gamePath?: string; launchOptions?: string } | null>(
        null
    )
    const [picking, setPicking] = useState(false)
    const [launchOptions, setLaunchOptions] = useState('')
    const launchOptionsLoaded = useRef(false)

    useEffect(() => {
        window.api.getSettings().then((s) => {
            setSettings(s)
            setLaunchOptions(s.launchOptions ?? '')
            launchOptionsLoaded.current = true
        })
    }, [])

    useEffect(() => {
        if (!launchOptionsLoaded.current) return
        const timer = setTimeout(() => window.api.setLaunchOptions(launchOptions), 500)
        return () => clearTimeout(timer)
    }, [launchOptions])

    const isManual = !!settings?.gamePath

    async function handleBrowse() {
        setPicking(true)
        try {
            const picked = await window.api.pickFolder()
            if (!picked) return
            await window.api.setGamePath(picked)
            setSettings((s) => ({ ...s, gamePath: picked }))
            await onGamePathChange()
        } finally {
            setPicking(false)
        }
    }

    async function handleReset() {
        await window.api.setGamePath(null)
        setSettings((s) => ({ ...s, gamePath: undefined }))
        await onGamePathChange()
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-border shrink-0">
                <h1 className="text-lg font-semibold">Settings</h1>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
                <section className="max-w-xl flex flex-col gap-2">
                    <h2 className="text-sm font-semibold">Game Path</h2>
                    <p className="text-xs text-text-subtle">
                        Path to your PAYDAY 3 installation. Detected automatically from Steam if not
                        set manually.
                    </p>

                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-hover border border-border mt-1">
                        <span className="text-sm font-mono truncate flex-1 text-text-muted">
                            {gamePath ?? 'Not found'}
                        </span>
                        <div className="flex gap-2 shrink-0">
                            {isManual && (
                                <button
                                    onClick={handleReset}
                                    className="text-xs px-3 py-1.5 rounded bg-surface-active hover:bg-surface-light transition-colors"
                                >
                                    Reset
                                </button>
                            )}
                            <button
                                disabled={picking}
                                onClick={handleBrowse}
                                className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {picking ? 'Picking…' : 'Browse'}
                            </button>
                        </div>
                    </div>

                    {isManual ? (
                        <p className="text-xs text-text-subtle">Manually set</p>
                    ) : gamePath ? (
                        <p className="text-xs text-success-text">Auto-detected from Steam</p>
                    ) : (
                        <p className="text-xs text-danger-text">
                            Could not detect PD3 installation — set the path manually.
                        </p>
                    )}
                </section>

                <section className="max-w-xl flex flex-col gap-2 mt-6">
                    <h2 className="text-sm font-semibold">Launch Options</h2>
                    <p className="text-xs text-text-subtle">
                        Extra arguments passed to PAYDAY 3 on launch via Steam.{' '}
                        <span className="font-mono text-text">-fileopenlog</span> is required for
                        mods to load correctly.
                    </p>
                    <input
                        type="text"
                        value={launchOptions}
                        onChange={(e) => setLaunchOptions(e.target.value)}
                        placeholder="-fileopenlog"
                        className="text-sm font-mono px-3 py-2 rounded-lg bg-surface-hover border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent mt-1"
                    />
                </section>
            </div>
        </div>
    )
}
