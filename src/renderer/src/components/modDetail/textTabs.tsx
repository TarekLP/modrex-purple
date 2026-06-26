import type { Mod } from '../../../../shared/types'
import { MarkdownContent } from '../MarkdownContent'
import { t } from '../../i18n'

export function DescriptionTab({ mod }: { mod: Mod }) {
    return (
        <div className="flex flex-col gap-6 max-w-3xl">
            {mod.desc ? (
                <section>
                    <MarkdownContent text={mod.desc} />
                </section>
            ) : (
                <p className="text-sm text-text-subtle">{t('detail.description.noDescription')}</p>
            )}

            {mod.license && (
                <section>
                    <h2 className="text-sm font-semibold mb-2 text-text">
                        {t('detail.description.license')}
                    </h2>
                    <p className="text-sm text-text-muted">{mod.license}</p>
                </section>
            )}
        </div>
    )
}

export function ChangelogTab({ mod }: { mod: Mod }) {
    return (
        <div className="max-w-3xl">
            <MarkdownContent text={mod.changelog!} />
        </div>
    )
}
