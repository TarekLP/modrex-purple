import { parseZipMultiPak } from './components/ZipPickerModal'
import type { ZipMultiPakPayload } from './components/ZipPickerModal'
import { parseHostModPack } from './components/HostPackModal'
import type { HostPackPayload } from './components/HostPackModal'
import { parseCbFlatArchive } from './components/CrimeBossFlatArchiveModal'
import type { CbFlatArchivePayload } from './components/CrimeBossFlatArchiveModal'
import { isUnrecognizedArchive } from './components/UnrecognizedArchiveModal'

/**
 * A Rust install command can return one of four "sentinel" error strings that mean
 * "this install needs a UI decision," not "this install failed":
 *   ZIP_MULTI_PAK · HOST_MOD_PACK · CB_FLAT_ARCHIVE · UNRECOGNIZED_ARCHIVE
 * Every install entry point must handle all four — missing one leaks a raw "*:{...}"
 * string to the user (the bug that hit the reinstall path and later the Updates modal).
 *
 * This is the single dispatcher every caller routes through. The handlers object is
 * required in full, so forgetting a sentinel is a compile error, and adding a new
 * sentinel is one edit here that breaks every call site until it's handled. Parse order
 * matches the original hand-written catch blocks.
 */
export interface InstallSentinelHandlers {
    onZipMultiPak: (payload: ZipMultiPakPayload) => void
    onHostModPack: (payload: HostPackPayload) => void
    onCbFlatArchive: (payload: CbFlatArchivePayload) => void
    onUnrecognizedArchive: () => void
}

/**
 * Returns `true` if `errStr` was a sentinel and the matching handler ran; `false` if it's
 * an ordinary error the caller should surface (throw, or show in an error banner).
 */
export function handleInstallSentinel(errStr: string, handlers: InstallSentinelHandlers): boolean {
    const zipData = parseZipMultiPak(errStr)
    if (zipData) {
        handlers.onZipMultiPak(zipData)
        return true
    }
    const hostData = parseHostModPack(errStr)
    if (hostData) {
        handlers.onHostModPack(hostData)
        return true
    }
    const cbFlatData = parseCbFlatArchive(errStr)
    if (cbFlatData) {
        handlers.onCbFlatArchive(cbFlatData)
        return true
    }
    if (isUnrecognizedArchive(errStr)) {
        handlers.onUnrecognizedArchive()
        return true
    }
    return false
}
