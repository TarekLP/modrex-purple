// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type * as UpdatesModalMod from './UpdatesModal'
import type { InstalledMod, Mod } from '../../../shared/types'

function makeInstalled(id: number, overrides: Partial<InstalledMod> = {}): InstalledMod {
    return {
        uid: `uid-${id}`,
        id,
        name: `Mod ${id}`,
        version: '1.0',
        filename: `Mod${id}.pak`,
        enabled: true,
        installedAt: '',
        ...overrides,
    }
}

function makeMod(id: number): Mod {
    return {
        id,
        name: `Mod ${id}`,
        desc: '',
        short_desc: '',
        version: '2.0',
        downloads: 0,
        likes: 0,
        views: 0,
        published_at: '',
        bumped_at: '',
        category_id: 0,
        has_download: false,
        thumbnail: null,
        download: null,
        user: { name: 'Test' },
    }
}

const ZIP_MULTI_PAK_FOR_MOD_1 = `ZIP_MULTI_PAK:${JSON.stringify({
    zipPath: '/tmp/archive.zip',
    entries: ['VariantA.pak', 'VariantB.pak'],
    modId: 1,
    modName: 'Mod 1',
    fileId: 555,
    fileType: 'zip',
    modVersion: '2.0',
})}`

let mockInstallMod: ReturnType<typeof vi.fn>
let UpdatesModal: typeof UpdatesModalMod.UpdatesModal

beforeEach(async () => {
    vi.resetModules()

    mockInstallMod = vi.fn()

    vi.doMock('../api', () => ({
        api: {
            installMod: mockInstallMod,
            // Rendered by ZipPickerModal on mount even though this test cancels the picker.
            onDownloadProgress: vi.fn(() => () => {}),
        },
    }))

    const mod = await import('./UpdatesModal')
    UpdatesModal = mod.UpdatesModal
})

describe('UpdatesModal batch update', () => {
    it('resumes the rest of the batch after a picker modal closes, without a second click', async () => {
        // mod 1's latest file is a multi-pak archive with nothing matching a prior install
        // (installed=[] below), so it genuinely needs the manual picker. mod 2 updates cleanly.
        mockInstallMod.mockImplementation(async (modId: number) => {
            // Tauri command rejections surface as the raw string thrown on the Rust side, not
            // wrapped in an Error — parseZipMultiPak matches against that raw string.
            if (modId === 1) throw ZIP_MULTI_PAK_FOR_MOD_1
        })

        const updatable = [makeInstalled(1), makeInstalled(2)]
        const modData = new Map([
            [1, makeMod(1)],
            [2, makeMod(2)],
        ])
        const onRefreshInstalled = vi.fn().mockResolvedValue(undefined)
        const onClose = vi.fn()

        render(
            <UpdatesModal
                updatable={updatable}
                modData={modData}
                installed={[]}
                gamePath="/game"
                gameId="pd3"
                visible={true}
                onRefreshInstalled={onRefreshInstalled}
                onClose={onClose}
                onOpenDetail={vi.fn()}
            />
        )

        fireEvent.click(screen.getByText('Update Selected (2)'))

        // The picker is open and the batch is paused — mod 2 must not be installed yet. Asserts
        // on the picker's footer button rather than its title, since the title text is
        // duplicated by Radix's sr-only Dialog.Title.
        await screen.findByText('Install Selected (2)')
        expect(mockInstallMod).toHaveBeenCalledTimes(1)
        expect(mockInstallMod).toHaveBeenCalledWith(1, '/game', 'pd3')

        // Cancelling the picker (no further user action on the Updates modal) must resume the
        // batch on its own — this is the bug: previously the rest of the selection was
        // abandoned until "Update Selected" was clicked again.
        fireEvent.click(screen.getByText('Cancel'))

        await waitFor(() => expect(mockInstallMod).toHaveBeenCalledTimes(2))
        expect(mockInstallMod).toHaveBeenCalledWith(2, '/game', 'pd3')
        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
})
