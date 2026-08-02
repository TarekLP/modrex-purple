import { Dialog, DialogHeader } from './Dialog'
import { t } from '../i18n'
import { Button } from './ui/Button'

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
 * ~mods target. Both directions confirm, since the move is otherwise silent and this is the
 * only feedback that anything happened. The wording differs: Mods/ to ~mods explains the
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
            <DialogHeader
                title={t(titleKey)}
                subtitle={t(bodyKey, { name: modName })}
                onClose={onCancel}
                closeDisabled={busy}
                wrapSubtitle
            />
            {error && (
                <div className="px-5 py-3 text-xs text-danger-text border-b border-border">
                    {error}
                </div>
            )}
            <div className="flex items-center justify-end gap-2 px-5 py-4 shrink-0">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={!busy ? onCancel : undefined}
                    disabled={busy}
                >
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="accent"
                    size="sm"
                    onClick={!busy ? onConfirm : undefined}
                    disabled={busy}
                >
                    {busy
                        ? t('installed.crimeBossMove.moving')
                        : t('installed.crimeBossMove.confirm')}
                </Button>
            </div>
        </Dialog>
    )
}
