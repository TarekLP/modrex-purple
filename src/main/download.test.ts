import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'fs'
import { Readable } from 'stream'
import { downloadFile } from './download'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockResponse(body: string, status = 200, contentLength?: string) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (h: string) => (h === 'content-length' ? (contentLength ?? null) : null) },
        body: Readable.from([Buffer.from(body)]),
    }
}

let lastPath: string | null = null

afterEach(() => {
    if (lastPath) {
        try {
            rmSync(lastPath)
        } catch {}
        lastPath = null
    }
    vi.clearAllMocks()
})

describe('downloadFile', () => {
    it('writes response body to disk and returns the path', async () => {
        const content = 'fake pak content'
        mockFetch.mockResolvedValue(mockResponse(content, 200, String(content.length)))
        lastPath = await downloadFile('https://example.com/mod.pak', 'pak')
        expect(existsSync(lastPath)).toBe(true)
        expect(readFileSync(lastPath, 'utf8')).toBe(content)
    })

    it('returns a path with the correct extension', async () => {
        mockFetch.mockResolvedValue(mockResponse('data'))
        lastPath = await downloadFile('https://example.com/mod.zip', 'zip')
        expect(lastPath).toMatch(/\.zip$/)
    })

    it('throws on HTTP 404', async () => {
        mockFetch.mockResolvedValue(mockResponse('Not Found', 404))
        await expect(downloadFile('https://example.com/mod.pak', 'pak')).rejects.toThrow('404')
    })

    it('throws on HTTP 500', async () => {
        mockFetch.mockResolvedValue(mockResponse('Server Error', 500))
        await expect(downloadFile('https://example.com/mod.pak', 'pak')).rejects.toThrow('500')
    })

    it('calls onProgress with cumulative downloaded bytes and total', async () => {
        const content = 'hello world'
        mockFetch.mockResolvedValue(mockResponse(content, 200, String(content.length)))
        const onProgress = vi.fn()
        lastPath = await downloadFile('https://example.com/mod.pak', 'pak', onProgress)
        expect(onProgress).toHaveBeenCalled()
        const [downloaded, total] = onProgress.mock.calls.at(-1)!
        expect(downloaded).toBe(content.length)
        expect(total).toBe(content.length)
    })

    it('reports total=0 when content-length header is absent', async () => {
        mockFetch.mockResolvedValue(mockResponse('no length header', 200, undefined))
        const onProgress = vi.fn()
        lastPath = await downloadFile('https://example.com/mod.pak', 'pak', onProgress)
        const [, total] = onProgress.mock.calls[0]
        expect(total).toBe(0)
    })

    it('sends User-Agent header', async () => {
        mockFetch.mockResolvedValue(mockResponse('data'))
        lastPath = await downloadFile('https://example.com/mod.pak', 'pak')
        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('pd3') }),
            })
        )
    })

    it('throws when fetch rejects (network failure)', async () => {
        mockFetch.mockRejectedValue(new Error('network error'))
        await expect(downloadFile('https://example.com/mod.pak', 'pak')).rejects.toThrow(
            'network error'
        )
    })
})
