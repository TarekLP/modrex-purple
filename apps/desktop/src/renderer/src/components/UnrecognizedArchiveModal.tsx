import { useEffect, useState } from 'react'
import { Button } from './ui/Button'
import { X } from 'lucide-react'
import { Dialog } from './Dialog'
import { MarkdownContent } from './MarkdownContent'
import { t } from '../i18n'
import { getCachedMod } from '../modCache'
import { SkeletonText } from './Skeleton'

interface Props {
    modId: number
    onClose: () => void
}

/**
 * Shown when an archive can't be placed in any scan target and isn't a known host pack — it
 * installs inside some other mod that Modrex can't infer. Surfaces the author's instructions
 * instead of silently mislaying the files.
 */
export function UnrecognizedArchiveModal({ modId, onClose }: Props) {
    const [instructions, setInstructions] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        getCachedMod(modId)
            .then((m) => {
                if (!cancelled) {
                    setInstructions(m.instructs_template?.instructions || m.instructions || '')
                }
            })
            .catch(() => {
                if (!cancelled) setInstructions('')
            })
        return () => {
            cancelled = true
        }
    }, [modId])

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => !open && onClose()}
            title={t('unrecognized.title')}
            className="w-[480px] max-h-[70vh]"
        >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">{t('unrecognized.title')}</h2>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="-mr-1 shrink-0 mt-0.5"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex flex-col gap-3">
                <p className="text-sm text-text-muted">{t('unrecognized.body')}</p>
                {instructions === null ? (
                    <SkeletonText />
                ) : instructions ? (
                    <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
                        <MarkdownContent text={instructions} />
                    </div>
                ) : (
                    <p className="text-sm text-text-subtle">{t('unrecognized.noInstructions')}</p>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                <Button variant="accent" size="lg" onClick={onClose}>
                    {t('common.close')}
                </Button>
            </div>
        </Dialog>
    )
}
