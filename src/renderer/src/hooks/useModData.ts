import { useState, useEffect, useRef, useMemo } from 'react'
import type { Mod, InstalledMod } from '../../../shared/types'
import { getInstalledMetaEntry, fetchInstalledModsMeta, INSTALLED_META_TTL_MS } from '../modCache'
import { getLocalImage } from '../thumbnailCache'

export function useModData(
    installed: InstalledMod[],
    workshopId: number
): {
    modData: Map<number, Mod>
    failedIds: Set<number>
    updatable: InstalledMod[]
} {
    const [modData, setModData] = useState<Map<number, Mod>>(new Map())
    const [failedIds, setFailedIds] = useState<Set<number>>(new Set())
    const fetchedAt = useRef<Map<number, number>>(new Map())
    const installedKey = useRef<string>('')

    useEffect(() => {
        if (installed.length === 0) {
            installedKey.current = ''
            setModData(new Map())
            setFailedIds(new Set())
            fetchedAt.current.clear()
            return
        }

        // Bail early when the set of mod ids hasn't changed — avoids redundant
        // sync pre-populate on every focus refresh that produces a new array reference.
        const nextKey = installed
            .map((m) => m.id)
            .sort((a, b) => a - b)
            .join(',')
        if (nextKey === installedKey.current) return
        installedKey.current = nextKey

        const now = Date.now()
        const fromCache: [number, Mod][] = []
        for (const m of installed) {
            if (m.id < 0) continue
            const entry = getInstalledMetaEntry(m.id)
            if (!entry) continue
            fromCache.push([m.id, entry.mod])
            // Mark as fetched so fresh entries skip the API call below
            if (now - entry.fetchedAt < INSTALLED_META_TTL_MS) {
                fetchedAt.current.set(m.id, entry.fetchedAt)
            }
        }
        for (const [, mod] of fromCache) {
            // Pre-warm the full-size variant — that's what ModCard renders.
            if (mod.thumbnail?.file) getLocalImage(mod.thumbnail.file, true).catch(() => {})
        }
        if (fromCache.length > 0) {
            setModData((prev) => {
                const next = new Map(prev)
                let changed = false
                for (const [id, mod] of fromCache) {
                    if (!next.has(id)) {
                        next.set(id, mod)
                        changed = true
                    }
                }
                return changed ? next : prev
            })
        }

        const stale = installed.filter((m) => {
            if (m.id < 0) return false
            const t = fetchedAt.current.get(m.id)
            return t === undefined || now - t >= INSTALLED_META_TTL_MS
        })
        if (stale.length === 0) return
        fetchInstalledModsMeta(
            workshopId,
            stale.map((m) => m.id)
        ).then(({ mods, failedIds: failed }) => {
            const fetchedNow = Date.now()
            for (const m of stale) fetchedAt.current.set(m.id, fetchedNow)
            for (const mod of mods.values()) {
                // Pre-warm the full-size variant — that's what ModCard renders.
                if (mod.thumbnail?.file) getLocalImage(mod.thumbnail.file, true).catch(() => {})
            }
            if (mods.size > 0) {
                setModData((prev) => {
                    const next = new Map(prev)
                    for (const [id, mod] of mods) next.set(id, mod)
                    return next
                })
            }
            if (failed.length > 0) {
                setFailedIds((prev) => new Set([...prev, ...failed]))
            }
        })
    }, [installed, workshopId])

    const updatable = useMemo(() => {
        const installedVersions = new Set(installed.map((m) => `${m.id}:${m.version}`))
        const seenIds = new Set<number>()
        return installed.filter((ins) => {
            if (seenIds.has(ins.id)) return false
            seenIds.add(ins.id)
            if (ins.missing) return false
            // No reliable installed version (name-matched / unindexed) — can't tell if it's
            // stale, so don't nag with a false "update available".
            if (!ins.version || ins.version === 'unknown') return false
            const mod = modData.get(ins.id)
            if (!mod) return false
            if (mod.version === ins.version) return false
            if (installedVersions.has(`${ins.id}:${mod.version}`)) return false
            return true
        })
    }, [installed, modData])

    return { modData, failedIds, updatable }
}
