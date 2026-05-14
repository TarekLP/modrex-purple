interface Props {
    gamePath: string | null
}

export function TopBar({ gamePath }: Props) {
    function launchModded() {
        window.api.launchModded()
    }

    function launchWithoutMods() {
        if (!gamePath) return
        window.api.launchWithoutMods(gamePath)
    }

    return (
        <div className="h-10 shrink-0 flex items-center justify-end gap-2 px-4 bg-surface border-b border-border">
            <button
                disabled={!gamePath}
                onClick={launchWithoutMods}
                className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
                Launch without mods
            </button>
            <button
                onClick={launchModded}
                className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright transition-colors"
            >
                Launch modded
            </button>
        </div>
    )
}
