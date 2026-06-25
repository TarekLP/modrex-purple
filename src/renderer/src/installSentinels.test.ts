import { beforeEach, describe, it, expect, vi } from 'vitest'

// Mock the four parser modules so this tests the dispatcher's routing in isolation
// (the parsers themselves are trivial startsWith/includes checks covered elsewhere) and
// avoids pulling the real modal components — and their heavy imports — into the node env.
let handleInstallSentinel: (typeof import('./installSentinels'))['handleInstallSentinel']

beforeEach(async () => {
    vi.resetModules()
    vi.doMock('./components/ZipPickerModal', () => ({
        parseZipMultiPak: (e: string) => (e.startsWith('ZIP_MULTI_PAK:') ? { tag: 'zip' } : null),
    }))
    vi.doMock('./components/HostPackModal', () => ({
        parseHostModPack: (e: string) => (e.startsWith('HOST_MOD_PACK:') ? { tag: 'host' } : null),
    }))
    vi.doMock('./components/CrimeBossFlatArchiveModal', () => ({
        parseCbFlatArchive: (e: string) =>
            e.startsWith('CB_FLAT_ARCHIVE:') ? { tag: 'cb' } : null,
    }))
    vi.doMock('./components/UnrecognizedArchiveModal', () => ({
        isUnrecognizedArchive: (e: string) => e.includes('UNRECOGNIZED_ARCHIVE'),
    }))
    ;({ handleInstallSentinel } = await import('./installSentinels'))
})

function makeHandlers() {
    return {
        onZipMultiPak: vi.fn(),
        onHostModPack: vi.fn(),
        onCbFlatArchive: vi.fn(),
        onUnrecognizedArchive: vi.fn(),
    }
}

describe('handleInstallSentinel', () => {
    it('routes ZIP_MULTI_PAK to onZipMultiPak only and returns true', () => {
        const h = makeHandlers()
        expect(handleInstallSentinel('ZIP_MULTI_PAK:{}', h)).toBe(true)
        expect(h.onZipMultiPak).toHaveBeenCalledTimes(1)
        expect(h.onHostModPack).not.toHaveBeenCalled()
        expect(h.onCbFlatArchive).not.toHaveBeenCalled()
        expect(h.onUnrecognizedArchive).not.toHaveBeenCalled()
    })

    it('routes HOST_MOD_PACK to onHostModPack only and returns true', () => {
        const h = makeHandlers()
        expect(handleInstallSentinel('HOST_MOD_PACK:{}', h)).toBe(true)
        expect(h.onHostModPack).toHaveBeenCalledTimes(1)
        expect(h.onZipMultiPak).not.toHaveBeenCalled()
    })

    it('routes CB_FLAT_ARCHIVE to onCbFlatArchive only and returns true', () => {
        const h = makeHandlers()
        expect(handleInstallSentinel('CB_FLAT_ARCHIVE:{}', h)).toBe(true)
        expect(h.onCbFlatArchive).toHaveBeenCalledTimes(1)
        expect(h.onZipMultiPak).not.toHaveBeenCalled()
    })

    it('routes UNRECOGNIZED_ARCHIVE to onUnrecognizedArchive only and returns true', () => {
        const h = makeHandlers()
        expect(handleInstallSentinel('UNRECOGNIZED_ARCHIVE: see instructions', h)).toBe(true)
        expect(h.onUnrecognizedArchive).toHaveBeenCalledTimes(1)
        expect(h.onZipMultiPak).not.toHaveBeenCalled()
    })

    it('returns false and calls nothing for an ordinary error', () => {
        const h = makeHandlers()
        expect(handleInstallSentinel('failed to download: network error', h)).toBe(false)
        expect(h.onZipMultiPak).not.toHaveBeenCalled()
        expect(h.onHostModPack).not.toHaveBeenCalled()
        expect(h.onCbFlatArchive).not.toHaveBeenCalled()
        expect(h.onUnrecognizedArchive).not.toHaveBeenCalled()
    })
})
