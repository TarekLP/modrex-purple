import { Dialog } from './Dialog'
import { t } from '../i18n'
import type { CrimeBossInstallTarget } from '../hooks/useCrimeBossInstallTarget'
import { Button } from './ui/Button'

interface Props {
    modName: string
    busy: boolean
    error: string | null
    onChoose: (target: CrimeBossInstallTarget) => void
    onCancel: () => void
}

/**
 * Shown before a fresh Crime Boss install when the user has set "Always ask" in Settings — there's
 * no way to tell from the archive alone whether a mod needs the official ModKit's Data Table merge
 * (Mods/) or plain pak mounting (~mods), so the choice is deferred to the user up front instead of
 * defaulting silently. Choosing "legacy" installs into Mods/ as normal, then relocates to ~mods
 * (see useCrimeBossInstallTarget) — there's no install path that writes directly into ~mods.
 */
export function CrimeBossInstallTargetModal({ modName, busy, error, onChoose, onCancel }: Props) {
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && !busy && onCancel()}
            title={t('crimeBossInstallChoice.title', { name: modName })}
            className="w-96"
        >
            <div className="px-5 py-4 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">
                    {t('crimeBossInstallChoice.title', { name: modName })}
                </h2>
                <p className="text-xs text-text-muted mt-1">{t('crimeBossInstallChoice.body')}</p>
            </div>
            {error && (
                <div className="px-5 py-3 text-xs text-danger-text border-b border-border">
                    {error}
                </div>
            )}
            <div className="flex flex-col gap-2 px-5 py-4 shrink-0">
                <Button
                    variant="accent"
                    size="md"
                    onClick={() => !busy && onChoose('auto')}
                    disabled={busy}
                    className="py-2"
                >
                    {busy
                        ? t('crimeBossInstallChoice.installing')
                        : t('crimeBossInstallChoice.auto')}
                </Button>
                <Button
                    variant="secondary"
                    size="md"
                    onClick={() => !busy && onChoose('legacy')}
                    disabled={busy}
                    className="py-2"
                >
                    {busy
                        ? t('crimeBossInstallChoice.installing')
                        : t('crimeBossInstallChoice.legacy')}
                </Button>
                <Button
                    variant="ghost"
                    size="md"
                    onClick={!busy ? onCancel : undefined}
                    disabled={busy}
                >
                    {t('common.cancel')}
                </Button>
            </div>
        </Dialog>
    )
}
