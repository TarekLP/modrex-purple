import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from './ui/Button'
import { api } from '../api'
import { t } from '../i18n'

// Shown when the backend discards a Nexus session that cannot be refreshed (see
// nexus_oauth.rs's end_session). Nothing in the app can recover it, since re-authorization
// happens in the browser, so this says so plainly instead of leaving every Nexus request
// to fail behind a UI that still reports the user as signed in.
export function NexusSessionBanner({ onDismiss }: { onDismiss: () => void }) {
    const [awaiting, setAwaiting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Sign-in finishes in the browser and comes back as an event, so there is nothing to
    // await here. Success unmounts this banner from App, leaving only failure to handle.
    useEffect(
        () =>
            api.onNexusOAuthFailed((message) => {
                setAwaiting(false)
                setError(message)
            }),
        []
    )

    // Stays enabled while awaiting: abandoning the browser tab produces no event, so a
    // disabled button would strand the banner. Clicking again starts a fresh attempt,
    // which nexus_oauth_start supports by design (it replaces any pending login).
    async function handleSignIn() {
        setError(null)
        setAwaiting(true)
        try {
            await api.nexusOAuthStart()
        } catch (e) {
            setAwaiting(false)
            setError(String(e))
        }
    }

    return (
        <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 bg-warning/10 border-b border-warning/30 text-xs text-warning">
            <div className="flex items-center gap-2 min-w-0">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                    {error ? t('nexusSession.failed', { error }) : t('nexusSession.expired')}
                </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                {awaiting && !error && (
                    <span className="text-text-subtle">{t('nexusSession.awaiting')}</span>
                )}
                <Button variant="warning" size="sm" onClick={handleSignIn}>
                    {t('nexusSession.signIn')}
                </Button>
                <Button variant="ghost" size="sm" onClick={onDismiss}>
                    {t('common.dismiss')}
                </Button>
            </div>
        </div>
    )
}
