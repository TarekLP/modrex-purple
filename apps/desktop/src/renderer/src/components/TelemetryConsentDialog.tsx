import { BarChart3 } from 'lucide-react'
import { Dialog } from './Dialog'
import { t } from '../i18n'
import { TelemetryConsentContent } from './TelemetryConsentContent'

interface Props {
    open: boolean
    onChoice: (enabled: boolean) => void
    /** First-run is forced (no dismiss). When reopened from Settings, allow
     *  closing without changing the current choice. */
    dismissable?: boolean
    onClose?: () => void
}

/**
 * Analytics consent pop-up. On first run it's forced — Escape and overlay clicks
 * can't dismiss it, only an explicit Enable / No thanks. Reopened from Settings
 * (`dismissable`), it can be closed without changing the existing choice.
 */
export function TelemetryConsentDialog({ open, onChoice, dismissable = false, onClose }: Props) {
    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o && dismissable) onClose?.()
            }}
            title={t('telemetry.title')}
            className="w-[460px] max-w-[90vw]"
        >
            <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-accent" />
                    </div>
                    <h2 className="text-lg font-semibold">{t('telemetry.title')}</h2>
                    <p className="text-sm text-text-muted">{t('telemetry.intro')}</p>
                </div>

                <TelemetryConsentContent />

                <div className="flex gap-2 justify-end mt-1">
                    <button
                        onClick={() => onChoice(false)}
                        className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-surface-hover transition-colors"
                    >
                        {t('telemetry.decline')}
                    </button>
                    <button
                        onClick={() => onChoice(true)}
                        className="px-4 py-2 rounded-lg bg-accent-fill hover:bg-accent-fill-hover text-sm font-medium transition-colors"
                    >
                        {t('telemetry.enable')}
                    </button>
                </div>
            </div>
        </Dialog>
    )
}
