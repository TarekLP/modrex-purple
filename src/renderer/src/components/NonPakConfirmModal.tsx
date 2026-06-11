import { AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialog'
import { t } from '../i18n'

interface Props {
    onConfirm: () => void
    onCancel: () => void
}

export function NonPakConfirmModal({ onConfirm, onCancel }: Props) {
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && onCancel()}
            title={t('common.nonPakWarning')}
            className="w-80"
        >
            <div className="p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold">{t('common.nonPakWarning')}</p>
                        <p className="text-xs text-text-muted mt-1">
                            {t('common.nonPakConfirmBody')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="text-xs px-3 py-1.5 rounded border border-border bg-surface-hover hover:bg-surface-active transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="text-xs px-3 py-1.5 rounded bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 transition-colors"
                    >
                        {t('common.downloadAnyway')}
                    </button>
                </div>
            </div>
        </Dialog>
    )
}
