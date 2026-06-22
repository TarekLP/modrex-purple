import { Dialog } from './Dialog'
import { t } from '../i18n'

interface Props {
    modName: string
    // true when moving Mods/ (ModKit) -> ~mods (loses Data Table merge); false for the reverse.
    toLegacy: boolean
    busy: boolean
    error: string | null
    onConfirm: () => void
    onCancel: () => void
}

/**
 * Confirms moving a Crime Boss mod between the primary Mods/ (ModKit) target and the legacy
 * ~mods target. Both directions confirm — the move is otherwise silent, so this doubles as the
 * only feedback that anything happened — but the wording differs: Mods/ -> ~mods explains the
 * Data Table merge tradeoff being given up, while ~mods -> Mods/ is a plain confirmation since it
 * only gains capability.
 */
export function MoveCrimeBossTargetModal({
    modName,
    toLegacy,
    busy,
    error,
    onConfirm,
    onCancel,
}: Props) {
    const titleKey = toLegacy
        ? 'installed.crimeBossMove.confirmTitleToLegacy'
        : 'installed.crimeBossMove.confirmTitleToModkit'
    const bodyKey = toLegacy
        ? 'installed.crimeBossMove.confirmBodyToLegacy'
        : 'installed.crimeBossMove.confirmBodyToModkit'
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && !busy && onCancel()}
            title={t(titleKey)}
            className="w-96"
        >
            <div className="px-5 py-4 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">{t(titleKey)}</h2>
                <p className="text-xs text-text-muted mt-1">{t(bodyKey, { name: modName })}</p>
            </div>
            {error && (
                <div className="px-5 py-3 text-xs text-danger-text border-b border-border">
                    {error}
                </div>
            )}
            <div className="flex items-center justify-end gap-2 px-5 py-4 shrink-0">
                <button
                    onClick={!busy ? onCancel : undefined}
                    disabled={busy}
                    className="text-xs px-3 py-1 rounded border border-border bg-surface-hover hover:bg-surface-active disabled:opacity-40 transition-colors"
                >
                    {t('common.cancel')}
                </button>
                <button
                    onClick={!busy ? onConfirm : undefined}
                    disabled={busy}
                    className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {busy
                        ? t('installed.crimeBossMove.moving')
                        : t('installed.crimeBossMove.confirm')}
                </button>
            </div>
        </Dialog>
    )
}
