import { useState, useEffect, useRef } from 'react'
import type { Mod, InstalledMod } from '../../../shared/types'
import { getCachedMod } from '../modCache'

const TTL_MS = 5 * 60 * 1000

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
        Promise.allSettled(stale.map((m) => getCachedMod(m.id))).then((results) => {
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
        const mod = modData.get(ins.id)
        if (mod && mod.version !== ins.version) {
            seenIds.add(ins.id)
            return true
        }
        return false
    })

    return { modData, failedIds, updatable }
}
