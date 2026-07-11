import type { Mod } from '../../../../shared/types'
import { MarkdownContent } from '../MarkdownContent'
import { t } from '../../i18n'

export function DescriptionTab({ mod }: { mod: Mod }) {
    return (
        <div className="max-w-3xl">
            {mod.desc ? (
                <MarkdownContent text={mod.desc} />
            ) : (
                <p className="text-sm text-text-subtle">{t('detail.description.noDescription')}</p>
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

export function LicenseTab({ mod }: { mod: Mod }) {
    return (
        <div className="max-w-3xl">
            <MarkdownContent text={mod.license!} />
        </div>
    )
}
