// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { InstalledMod, Mod, ModSummary } from '../../../shared/types'

const mockNexusGetModDetail = vi.fn()
const mockGetMod = vi.fn()
const mockListModFiles = vi.fn()
const mockListModLinks = vi.fn()
const mockListMods = vi.fn()

vi.mock('../api', () => ({
    api: {
        nexusGetModDetail: (...args: unknown[]) => mockNexusGetModDetail(...args),
        getMod: (...args: unknown[]) => mockGetMod(...args),
        listModFiles: (...args: unknown[]) => mockListModFiles(...args),
        listModLinks: (...args: unknown[]) => mockListModLinks(...args),
        listMods: (...args: unknown[]) => mockListMods(...args),
    },
}))
vi.mock('../thumbnailCache', () => ({
    getLocalImage: vi.fn().mockResolvedValue('thumb://x'),
}))

import { useModData } from './useModData'

function makeNexusInstall(id: number, remoteId: string, version: string): InstalledMod {
    return {
        uid: `nexus:${remoteId}`,
        id,
        name: 'Unmask Mod',
        version,
        filename: 'unmask.pak',
        enabled: true,
        installedAt: '2024-01-01T00:00:00Z',
        source: 'nexus',
        remoteId,
    }
}

function makeWorkshopInstall(id: number, version: string): InstalledMod {
    return {
        uid: `${id}`,
        id,
        // InstalledMod.id is an opaque local key even for modworkshop mods now;
        // useModData reads remoteId to know the real id to fetch/refresh against.
        remoteId: String(id),
        name: 'Workshop Mod',
        version,
        filename: 'workshop.pak',
        enabled: true,
        installedAt: '2024-01-01T00:00:00Z',
    }
}

function makeNexusDetail(id: number, version: string): Mod {
    return {
        id,
        name: 'Unmask Mod',
        desc: '',
        short_desc: '',
        version,
        downloads: 0,
        likes: 0,
        views: 0,
        published_at: '',
        bumped_at: '',
        category_id: 0,
        has_download: true,
        disable_mod_managers: null,
        thumbnail: null,
        download: null,
        user: { id: null, name: '', donation_url: null, avatar: null, avatar_has_thumb: null },
        changelog: null,
        instructions: null,
        license: null,
        repo_url: null,
        donation: null,
        banner: null,
        images: [],
        dependencies: [],
        instructs_template: null,
        tags: [],
        members: [],
    }
}

function makeWorkshopSummary(id: number, version: string): ModSummary {
    return {
        id,
        name: 'Workshop Mod',
        desc: '',
        short_desc: '',
        version,
        downloads: 0,
        likes: 0,
        views: 0,
        published_at: '',
        bumped_at: '',
        category_id: 0,
        has_download: true,
        disable_mod_managers: null,
        thumbnail: null,
        download: null,
        user: { id: null, name: '', donation_url: null, avatar: null, avatar_has_thumb: null },
    }
}

beforeEach(() => {
    mockNexusGetModDetail.mockReset()
    mockGetMod.mockReset()
    mockListModFiles.mockReset()
    mockListModLinks.mockReset()
    mockListMods.mockReset()
})

describe('useModData end-to-end with a real installed Nexus mod', () => {
    it('flags an installed Nexus mod as updatable when Nexus reports a newer version', async () => {
        const installed = [makeNexusInstall(-216, '216', '1.0.0')]
        mockNexusGetModDetail.mockResolvedValue(makeNexusDetail(216, '1.1.0'))

        const { result } = renderHook(() => useModData(installed, 853, 'pd3'))

        await waitFor(() => expect(result.current.updatable).toHaveLength(1))
        expect(mockNexusGetModDetail).toHaveBeenCalledWith('pd3', 216)
        expect(mockListMods).not.toHaveBeenCalled()
        expect(result.current.updatable[0]).toBe(installed[0])
        expect(result.current.modData.get(-216)?.version).toBe('1.1.0')
    })

    it('does not flag an installed Nexus mod as updatable when the version already matches', async () => {
        // A distinct mod id from the other tests in this file: nexusModCache's cache is
        // module-level state that outlives a single test, so reusing an id another test
        // already resolved would read that test's cached version instead of calling the
        // mock this test configures.
        const installed = [makeNexusInstall(-300, '300', '1.1.0')]
        mockNexusGetModDetail.mockResolvedValue(makeNexusDetail(300, '1.1.0'))

        const { result } = renderHook(() => useModData(installed, 853, 'pd3'))

        await waitFor(() => expect(result.current.modData.get(-300)).toBeDefined())
        expect(result.current.updatable).toEqual([])
    })

    it('checks a modworkshop mod and a Nexus mod through their own separate paths at once', async () => {
        const installed = [
            makeWorkshopInstall(58065, '2.11'),
            makeNexusInstall(-400, '400', '1.0.0'),
        ]
        mockListMods.mockResolvedValue({
            data: [makeWorkshopSummary(58065, '3.0')],
            meta: {},
        })
        mockNexusGetModDetail.mockResolvedValue(makeNexusDetail(400, '1.1.0'))

        const { result } = renderHook(() => useModData(installed, 853, 'pd3'))

        await waitFor(() => expect(result.current.updatable).toHaveLength(2))
        expect(mockListMods).toHaveBeenCalledWith(853, { ids: [58065], limit: 1 })
        expect(mockNexusGetModDetail).toHaveBeenCalledWith('pd3', 400)
    })

    it('reports the mod as failed rather than crashing when the Nexus request rejects', async () => {
        const installed = [makeNexusInstall(-500, '500', '1.0.0')]
        mockNexusGetModDetail.mockRejectedValue(new Error('nexus API 429'))

        const { result } = renderHook(() => useModData(installed, 853, 'pd3'))

        await waitFor(() => expect(result.current.failedIds.has(-500)).toBe(true))
        expect(result.current.modData.has(-500)).toBe(false)
        expect(result.current.updatable).toEqual([])
    })
})
