import { t } from '../i18n'

/** Sources whose integration is still new enough that users should expect breakage. */
const BETA_SOURCES = new Set(['nexus'])

export function isBetaSource(sourceId: string): boolean {
    return BETA_SOURCES.has(sourceId)
}

/**
 * Marks a feature as not-yet-finished. Deliberately renderer-only: this is about how
 * polished something feels, which the backend has no opinion on and never reads.
 */
export function BetaBadge() {
    return (
        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent">
            {t('common.beta')}
        </span>
    )
}
