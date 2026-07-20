import { useEffect, useState } from 'react'
import { api } from '../api'
import { sourcesForGame } from '../sources'
import { waitForForegroundClear } from '../requestPriority'
import { formatCount } from './modDetail/format'
import { SkeletonBar } from './Skeleton'
import { t } from '../i18n'
import { GAMES, type GameId } from '../../../shared/types'

// Brand names, deliberately not in en.json: they are proper nouns, and installedUtils
// already labels the source this way.
const SOURCE_LABELS: Record<string, string> = {
    modworkshop: 'ModWorkshop',
    nexus: 'Nexus Mods',
}

// Library-wide totals per (game, source), for the session. Unlike the footer count these
// do not move as the user searches, so they are fetched once and reused: re-reading them
// per keystroke would spend the ModWorkshop rate limit and the Nexus daily quota on a
// number that never changes. null means "asked, no answer" (see fetchCount).
//
// This is a shared store rather than per-component state because BOTH browse pages render
// a switcher and stay mounted at once. With local state, whichever instance's fetch was
// cancelled kept an empty map forever (its effect only re-runs on game change), so one tab
// showed counts and the other did not. Subscribers are notified on every write, so a count
// fetched by either instance lands in both, and inFlight keeps two instances from making
// the same request twice.
const countCache = new Map<string, number | null>()
const inFlight = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()

const cacheKey = (gameId: string, sourceId: string) => `${gameId}:${sourceId}`

function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
        listeners.delete(fn)
    }
}

function ensureCount(gameId: GameId, sourceId: string): void {
    const key = cacheKey(gameId, sourceId)
    if (countCache.has(key) || inFlight.has(key)) return
    inFlight.set(
        key,
        (async () => {
            // Yield to whatever the user is actually waiting on; these totals are
            // supplementary and share the same rate-limited connection.
            await waitForForegroundClear()
            const total = await fetchCount(gameId, sourceId).catch(() => null)
            countCache.set(key, total)
            inFlight.delete(key)
            for (const l of listeners) l()
        })()
    )
}

/**
 * The total this source carries for this game, ignoring any active filter. Both requests
 * ask for the smallest possible page, since only meta.total is wanted.
 *
 * Returns null when there is no answer to be had rather than surfacing an error: the count
 * is supplementary, and the common null case is simply not being signed in to Nexus, which
 * is an expected state and not a failure. The switcher stays usable either way.
 */
async function fetchCount(gameId: GameId, sourceId: string): Promise<number | null> {
    if (sourceId === 'nexus') {
        if (!(await api.isNexusSignedIn())) return null
        const page = await api.nexusSearchMods(gameId, '', 'downloads', 0)
        return page.meta.total
    }
    const page = await api.listMods(GAMES[gameId].workshopId, { limit: 1 })
    return page.meta.total
}

function cachedCounts(gameId: GameId): Record<string, number | null> {
    const out: Record<string, number | null> = {}
    for (const s of sourcesForGame(gameId)) {
        const hit = countCache.get(cacheKey(gameId, s.id))
        if (hit !== undefined) out[s.id] = hit
    }
    return out
}

/**
 * Picks which source Browse is showing. Both sources stay on screen as visible choices
 * rather than collapsing into a dropdown, so a user who never opens a menu still learns
 * the second one exists. Uses the mod detail page's underlined-tab treatment, sitting on
 * the title line so it reads as where you are browsing rather than as another filter.
 *
 * Renders nothing when the game has only one source, which is the case for PD2, PDTH and
 * RAID: a switcher offering a single choice is noise.
 *
 * Results are deliberately NOT merged across sources. The two have separate search
 * engines, so their sort options differ, their relevance scores are not comparable, and
 * their page cursors are independent. One source is active at a time and each keeps its
 * own query, sort and page.
 */
export function SourceSelect({
    activeGame,
    value,
    onChange,
}: {
    activeGame: GameId
    value: string
    onChange: (next: string) => void
}) {
    const sources = sourcesForGame(activeGame)
    const [counts, setCounts] = useState<Record<string, number | null>>(() =>
        cachedCounts(activeGame)
    )

    useEffect(() => {
        const sync = () => setCounts(cachedCounts(activeGame))
        const unsubscribe = subscribe(sync)
        // Only worth asking when the switcher is actually shown.
        if (sourcesForGame(activeGame).length > 1) {
            for (const s of sourcesForGame(activeGame)) ensureCount(activeGame, s.id)
        }
        sync()
        return unsubscribe
    }, [activeGame])

    if (sources.length < 2) return null

    return (
        <div className="flex items-end gap-1 shrink-0">
            {sources.map((s) => {
                const active = value === s.id
                const total = counts[s.id]
                return (
                    <button
                        key={s.id}
                        onClick={() => onChange(s.id)}
                        className={`relative px-4 py-1 border-b-2 transition-colors text-left before:content-[''] before:absolute before:inset-x-1 before:inset-y-0.5 before:rounded before:transition-colors focus:outline-none ${
                            active
                                ? 'border-accent text-accent'
                                : 'border-transparent text-text-subtle hover:text-text-muted hover:before:bg-surface-hover'
                        }`}
                    >
                        <span className="relative block text-sm font-medium leading-tight">
                            {SOURCE_LABELS[s.id] ?? s.id}
                        </span>
                        {/* Three distinct states, and they must not look alike: still
                            loading shows a skeleton, no answer (signed out of Nexus) keeps
                            the line's height so the header cannot jump, and a real count
                            renders. A blank in the loading case read as "no data". */}
                        <span className="relative block text-[11px] leading-tight text-text-subtle">
                            {total === undefined ? (
                                <SkeletonBar className="h-2.5 w-14 my-[3px] animate-pulse" />
                            ) : total === null ? (
                                ' '
                            ) : (
                                t('browse.modCount', { total: formatCount(total) })
                            )}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
