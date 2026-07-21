import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type * as RequestPriorityMod from './requestPriority'

let priority!: typeof RequestPriorityMod

beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    priority = await import('./requestPriority')
})

afterEach(() => {
    vi.useRealTimers()
})

describe('waitForForegroundClear', () => {
    it('resolves immediately when there has been no foreground activity', async () => {
        const resolved = vi.fn()
        priority.waitForForegroundClear().then(resolved)
        await vi.advanceTimersByTimeAsync(0)
        expect(resolved).toHaveBeenCalled()
    })

    it('waits out the quiet window after foreground activity', async () => {
        priority.markForegroundActivity()
        const resolved = vi.fn()
        priority.waitForForegroundClear().then(resolved)

        await vi.advanceTimersByTimeAsync(1000)
        expect(resolved).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(600)
        expect(resolved).toHaveBeenCalled()
    })

    it('extends the wait when foreground activity is marked again mid-wait', async () => {
        priority.markForegroundActivity()
        const resolved = vi.fn()
        priority.waitForForegroundClear().then(resolved)

        await vi.advanceTimersByTimeAsync(1000)
        priority.markForegroundActivity()
        expect(resolved).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1000)
        expect(resolved).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(600)
        expect(resolved).toHaveBeenCalled()
    })
})
