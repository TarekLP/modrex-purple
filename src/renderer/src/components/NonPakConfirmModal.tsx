import { AlertTriangle } from 'lucide-react'
import { t } from '../i18n'

interface Props {
    onConfirm: () => void
    onCancel: () => void
}

export function NonPakConfirmModal({ onConfirm, onCancel }: Props) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onCancel}
        >
            <div
                className="bg-surface-raised border border-border rounded-lg shadow-xl w-80 p-5 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
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
                        className="text-xs px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-active transition-colors"
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
        </div>
    )
}
