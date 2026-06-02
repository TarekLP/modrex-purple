import { useState, useEffect, useRef } from 'react'
import type { Mod, InstalledMod } from '../../../shared/types'
import { getCachedMod, getModCacheEntry } from '../modCache'
import { getLocalThumbnail } from '../thumbnailCache'

const TTL_MS = 5 * 60 * 1000
const FETCH_CONCURRENCY = 5
const BATCH_DELAY_MS = 200

async function fetchInBatches<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = []
    for (let i = 0; i < items.length; i += FETCH_CONCURRENCY) {
        if (i > 0) await new Promise<void>((r) => setTimeout(r, BATCH_DELAY_MS))
        const batch = items.slice(i, i + FETCH_CONCURRENCY)
        results.push(...(await Promise.allSettled(batch.map(fn))))
    }
    return results
}

export function useModData(installed: InstalledMod[]): {
    modData: Map<number, Mod>
    failedIds: Set<number>
    updatable: InstalledMod[]
} {
    const [modData, setModData] = useState<Map<number, Mod>>(new Map())
    const [failedIds, setFailedIds] = useState<Set<number>>(new Set())
    const fetchedAt = useRef<Map<number, number>>(new Map())

    useEffect(() => {
        // Sync pre-populate from localStorage-backed cache for immediate render
        const now = Date.now()
        const fromCache: [number, Mod][] = []
        for (const m of installed) {
            if (m.id < 0) continue
            const entry = getModCacheEntry(m.id)
            if (!entry) continue
            fromCache.push([m.id, entry.mod])
            // Mark as fetched so fresh entries skip the API call below
            if (now - entry.fetchedAt < TTL_MS) {
                fetchedAt.current.set(m.id, entry.fetchedAt)
            }
        }
        for (const [, mod] of fromCache) {
            if (mod.thumbnail?.file) getLocalThumbnail(mod.thumbnail.file).catch(() => {})
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
            return t === undefined || now - t >= TTL_MS
        })
        if (stale.length === 0) return
        fetchInBatches(stale, (m) => getCachedMod(m.id)).then((results) => {
            const updates: [number, Mod][] = []
            const failed: number[] = []
            results.forEach((r, i) => {
                fetchedAt.current.set(stale[i].id, Date.now())
                if (r.status === 'fulfilled') {
                    updates.push([stale[i].id, r.value])
                } else {
                    failed.push(stale[i].id)
                }
            })
            for (const [, mod] of updates) {
                if (mod.thumbnail?.file) getLocalThumbnail(mod.thumbnail.file).catch(() => {})
            }
            if (updates.length > 0) {
                setModData((prev) => {
                    const next = new Map(prev)
                    updates.forEach(([id, mod]) => next.set(id, mod))
                    return next
                })
            }
            if (failed.length > 0) {
                setFailedIds((prev) => new Set([...prev, ...failed]))
            }
        })
    }, [installed])

    const seenIds = new Set<number>()
    const updatable = installed.filter((ins) => {
        if (seenIds.has(ins.id)) return false
        seenIds.add(ins.id)
        if (ins.missing) return false
        const mod = modData.get(ins.id)
        if (!mod) return false
        if (mod.version === ins.version) return false
        if (installed.some((m) => m.id === ins.id && m.version === mod.version)) return false
        return true
    })

    return { modData, failedIds, updatable }
}
