import { Dialog } from './Dialog'
import { t } from '../i18n'
import { Button } from './ui/Button'

interface Props {
    onConfirm: () => void
    onCancel: () => void
}

export function DeleteFolderModal({ onConfirm, onCancel }: Props) {
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && onCancel()}
            title={t('installed.folder.delete')}
            className="w-80"
        >
            <div className="px-5 py-4 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">{t('installed.folder.delete')}</h2>
                <p className="text-xs text-text-muted mt-1">
                    {t('installed.folder.deleteConfirm')}
                </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 shrink-0">
                <Button variant="secondary" size="sm" onClick={onCancel}>
                    {t('common.cancel')}
                </Button>
                <Button variant="danger" size="sm" onClick={onConfirm}>
                    {t('installed.folder.delete')}
                </Button>
            </div>
        </Dialog>
    )
}
