import { useState, useEffect, useRef } from 'react'
import type { Mod, InstalledMod } from '../../../shared/types'
import { getCachedMod } from '../modCache'

const TTL_MS = 5 * 60 * 1000
const FETCH_CONCURRENCY = 5

async function fetchInBatches<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = []
    for (let i = 0; i < items.length; i += FETCH_CONCURRENCY) {
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
        const now = Date.now()
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
        const mod = modData.get(ins.id)
        if (!mod) return false
        if (mod.version === ins.version) return false
        // If any installed entry for this mod already has the current API version, skip
        if (installed.some((m) => m.id === ins.id && m.version === mod.version)) return false
        return true
    })

    return { modData, failedIds, updatable }
}
