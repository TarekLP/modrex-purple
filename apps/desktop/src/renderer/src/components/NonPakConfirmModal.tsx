import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogHeader } from './Dialog'
import { t } from '../i18n'
import { Button } from './ui/Button'

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
            <DialogHeader
                title={t('common.nonPakWarning')}
                subtitle={t('common.nonPakConfirmBody')}
                icon={<AlertTriangle className="w-4 h-4 text-warning shrink-0" />}
                onClose={onCancel}
                wrapSubtitle
            />
            <div className="flex items-center justify-end gap-2 px-5 py-4 shrink-0">
                <Button variant="secondary" size="md" onClick={onCancel}>
                    {t('common.cancel')}
                </Button>
                <button
                    onClick={onConfirm}
                    className="text-xs px-3 py-1.5 rounded bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 transition-colors"
                >
                    {t('common.downloadAnyway')}
                </button>
            </div>
        </Dialog>
    )
}
