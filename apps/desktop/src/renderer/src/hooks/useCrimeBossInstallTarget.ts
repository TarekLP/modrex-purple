import { useCallback, useState } from 'react'
import type { GameId } from '../../../shared/types'
import { getSettingsCache } from '../settingsCache'
import { api } from '../api'

export type CrimeBossInstallTarget = 'auto' | 'legacy'

interface PendingChoice {
    modId: number
    modName: string
    install: () => Promise<void>
}

/**
 * Gates a Crime Boss install behind a Mods/ (ModKit) vs ~mods (legacy pak) choice when the user
 * has set "Always ask" in Settings (crimebossInstallMode); every other game, and "Automatic"
 * mode, runs install immediately with no prompt. There's no way to tell from file content alone
 * which target a given mod actually needs (see CLAUDE.md's Crime Boss section), so this defers the
 * decision to the user instead of guessing. Install always lands in Mods/ either way (the
 * target resolve_crimeboss_archive knows how to install fresh into); choosing "legacy" here just
 * relocates the result afterward via the same move_crimeboss_mod_target op the Installed page uses.
 */
export function useCrimeBossInstallTarget(
    activeGame: GameId,
    gamePath: string | null,
    onRefreshInstalled: () => Promise<void>
) {
    const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null)
    const [relocating, setRelocating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Stable across renders so it can be depended on from a memoized callback (e.g. BrowsePage's
    // handleInstall, which crosses the ModGrid memo boundary, see CLAUDE.md).
    const runInstall = useCallback(
        (modId: number, modName: string, install: () => Promise<void>): Promise<void> => {
            const mode =
                activeGame === 'cb'
                    ? getSettingsCache('cb')?.settings.crimebossInstallMode
                    : undefined
            if (mode !== 'ask') return install()
            setError(null)
            setPendingChoice({ modId, modName, install })
            return Promise.resolve()
        },
        [activeGame]
    )

    async function relocateNewEntries(modId: number) {
        if (!gamePath) return
        const { mods } = await api.getInstalled(activeGame)
        // modId here is always the real modworkshop id (Nexus installs never reach this
        // hook). InstalledMod.id is an opaque local key, so match against remoteId.
        const modIdStr = String(modId)
        const fresh = mods.filter((m) => m.remoteId === modIdStr && !m.location)
        for (const m of fresh) {
            await api.moveCrimeBossModTarget(m.uid, gamePath)
        }
    }

    async function confirmChoice(target: CrimeBossInstallTarget) {
        if (!pendingChoice) return
        const { modId, install } = pendingChoice
        setRelocating(true)
        setError(null)
        try {
            await install()
            await onRefreshInstalled()
            if (target === 'legacy') {
                await relocateNewEntries(modId)
                await onRefreshInstalled()
            }
            setPendingChoice(null)
        } catch (e) {
            setError(String(e))
        } finally {
            setRelocating(false)
        }
    }

    function cancelChoice() {
        setPendingChoice(null)
        setError(null)
    }

    return { pendingChoice, relocating, error, runInstall, confirmChoice, cancelChoice }
}
