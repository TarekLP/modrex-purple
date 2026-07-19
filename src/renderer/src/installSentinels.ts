import type { InstallOutcome } from './api'
import type { ZipMultiPakPayload } from './components/ZipPickerModal'
import type { HostPackPayload } from './components/HostPackModal'
import type { CbFlatArchivePayload } from './components/CrimeBossFlatArchiveModal'

/**
 * An install command resolves to a typed InstallOutcome: 'installed', or one of four
 * "needs a UI decision" prompts (multi-pak picker, host-pack choice, Crime Boss flat
 * archive confirm, unrecognized archive). Every install entry point must handle all
 * four - missing one used to leak a raw "*:{...}" string to the user back when these
 * rode the error channel as sentinel strings.
 *
 * This is the single dispatcher every caller routes through. The handlers object is
 * required in full, so forgetting a prompt is a compile error, and a new outcome
 * variant breaks this switch (and therefore every call site) until it's handled.
 */
export interface InstallSentinelHandlers {
    onZipMultiPak: (payload: ZipMultiPakPayload) => void
    onHostModPack: (payload: HostPackPayload) => void
    onCbFlatArchive: (payload: CbFlatArchivePayload) => void
    onUnrecognizedArchive: () => void
}

/**
 * Returns `true` if the outcome was a prompt and the matching handler ran; `false`
 * means the install completed. The command enriches every prompt payload with the
 * mod context (modId, modName, ...) before it reaches the renderer, so the cast to
 * the modal-facing payload types is sound.
 */
export function handleInstallOutcome(
    outcome: InstallOutcome,
    handlers: InstallSentinelHandlers
): boolean {
    if (outcome === 'installed') return false
    if (outcome === 'unrecognized') {
        handlers.onUnrecognizedArchive()
        return true
    }
    if ('needsPicker' in outcome) {
        handlers.onZipMultiPak(outcome.needsPicker as unknown as ZipMultiPakPayload)
        return true
    }
    if ('needsHostChoice' in outcome) {
        handlers.onHostModPack(outcome.needsHostChoice as unknown as HostPackPayload)
        return true
    }
    handlers.onCbFlatArchive(outcome.needsCbFlatConfirm as unknown as CbFlatArchivePayload)
    return true
}
