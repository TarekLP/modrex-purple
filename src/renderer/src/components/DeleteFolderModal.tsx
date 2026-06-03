import { t } from '../i18n'

interface Props {
    onConfirm: () => void
    onCancel: () => void
}

export function DeleteFolderModal({ onConfirm, onCancel }: Props) {
    return (
        <div
            className="absolute inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={(e) => e.target === e.currentTarget && onCancel()}
        >
            <div className="bg-surface-raised border border-border rounded-xl w-full max-w-sm mx-6 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                    <h2 className="text-sm font-semibold">{t('installed.folder.delete')}</h2>
                    <p className="text-xs text-text-muted mt-1">
                        {t('installed.folder.deleteConfirm')}
                    </p>
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-4">
                    <button
                        onClick={onCancel}
                        className="text-xs px-3 py-1 rounded bg-surface-hover hover:bg-surface-active transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="text-xs px-3 py-1 rounded bg-danger hover:bg-danger-hover transition-colors"
                    >
                        {t('installed.folder.delete')}
                    </button>
                </div>
            </div>
        </div>
    )
}
