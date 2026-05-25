import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0-test' } }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getMod, listMods } from './api'

afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
})

function okResponse(data: object = {}) {
    return { ok: true, status: 200, json: async () => data }
}

describe('concurrency queue', () => {
    it('allows at most 3 requests in-flight simultaneously', async () => {
        let peak = 0
        let current = 0

        mockFetch.mockImplementation(async () => {
            current++
            peak = Math.max(peak, current)
            await new Promise<void>((r) => setTimeout(r, 10))
            current--
            return okResponse()
        })

        await Promise.all(Array.from({ length: 10 }, () => getMod(1)))

        expect(peak).toBeLessThanOrEqual(3)
        expect(mockFetch).toHaveBeenCalledTimes(10)
    })
})

describe('429 retry', () => {
    it('retries once after a jitter delay on 429', async () => {
        vi.useFakeTimers()
        mockFetch
            .mockResolvedValueOnce({ ok: false, status: 429 })
            .mockResolvedValueOnce(okResponse({ id: 42 }))

        const promise = getMod(42)
        await vi.runAllTimersAsync()
        const result = await promise

        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(result).toEqual({ id: 42 })
    })

    it('throws if the retry also returns 429', async () => {
        vi.useFakeTimers()
        mockFetch.mockResolvedValue({ ok: false, status: 429 })

        const promise = getMod(1)
        const assertion = expect(promise).rejects.toThrow('modworkshop API 429')
        await vi.runAllTimersAsync()
        await assertion

        expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws immediately on non-429 errors without retrying', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 })
        await expect(getMod(1)).rejects.toThrow('modworkshop API 404')
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })
})

describe('request building', () => {
    it('appends params as query string for listMods', async () => {
        mockFetch.mockResolvedValue(okResponse({ data: [], meta: {} }))

        await listMods({ page: 2, sort: 'likes', limit: 24 })

        const url = new URL(mockFetch.mock.calls[0][0] as string)
        expect(url.searchParams.get('page')).toBe('2')
        expect(url.searchParams.get('sort')).toBe('likes')
        expect(url.searchParams.get('limit')).toBe('24')
    })

    it('omits undefined params from the query string', async () => {
        mockFetch.mockResolvedValue(okResponse({ data: [], meta: {} }))

        await listMods({ page: 1, query: undefined })

        const url = new URL(mockFetch.mock.calls[0][0] as string)
        expect(url.searchParams.has('query')).toBe(false)
    })
})
