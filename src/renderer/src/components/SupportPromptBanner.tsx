import { siGithub } from 'simple-icons'
import { Button } from './ui/Button'
import { api } from '../api'
import { t } from '../i18n'

const GITHUB_URL = 'https://github.com/modrexio/modrex'

// One-time "star us on GitHub" banner. The shown flag is already persisted by the
// time this renders (settings.rs::record_successful_install writes it before
// emitting the event), so closing is purely visual — it can never come back.
export function SupportPromptBanner({ onClose }: { onClose: () => void }) {
    return (
        <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 bg-surface-raised border-b border-border">
            <span className="text-sm text-text-muted">{t('supportPrompt.body')}</span>
            <div className="flex items-center gap-2 shrink-0">
                <Button
                    variant="accent"
                    size="sm"
                    onClick={() => {
                        api.openExternal(GITHUB_URL)
                        onClose()
                    }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        className="w-3.5 h-3.5 shrink-0 fill-current"
                        aria-hidden
                    >
                        <path d={siGithub.path} />
                    </svg>
                    {t('supportPrompt.star')}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                    {t('supportPrompt.dismiss')}
                </Button>
            </div>
        </div>
    )
}
