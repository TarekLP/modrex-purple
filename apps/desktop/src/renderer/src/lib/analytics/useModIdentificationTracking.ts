import { useEffect, useRef } from 'react'
import type { GameId, InstalledMod } from '../../../../shared/types'
import { trackModIdentification } from './events'

/**
 * Emits mod_identification whenever the installed set's identification counts
 * change for the active game. Gated on a per-game signature so focus-refreshes,
 * reorders, and tab switches, which produce new array refs but the same counts,
 * don't spam the event. This is modrex's index.db coverage signal in the wild.
 *
 * A mod is "unidentified" when it carries no remoteId at all (the index.db SHA256
 * and name passes couldn't match it to a real modworkshop id). Installs identified
 * against another source (remoteId set, e.g. Nexus) are not unidentified, just not on
 * modworkshop, and counting them would corrupt the coverage signal.
 */
export function useModIdentificationTracking(installed: InstalledMod[], game: GameId): void {
    const lastSignature = useRef('')
    useEffect(() => {
        const total = installed.length
        // Empty list = a game switch mid-load, not a real "zero mods" state. Skip it
        // without recording a signature so the true count still fires when it lands.
        if (total === 0) return

        const unidentified = installed.filter((m) => !m.remoteId).length
        const signature = `${game}:${total}:${unidentified}`
        if (signature === lastSignature.current) return
        lastSignature.current = signature

        trackModIdentification(game, { total, identified: total - unidentified, unidentified })
    }, [installed, game])
}
