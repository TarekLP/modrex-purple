import { getLocale } from '../../i18n'

export function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${parseFloat((bytes / 1024 / 1024).toFixed(1))} MB`
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(getLocale(), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

export function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
}

// 'short' style, not 'narrow': narrow has no dedicated Russian relative-time pattern in
// ICU and falls back to a bare signed number and unit, with no "ago" wording at all.
const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>()

function relativeTimeFormatter(): Intl.RelativeTimeFormat {
    const locale = getLocale()
    let formatter = relativeTimeFormatters.get(locale)
    if (!formatter) {
        formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' })
        relativeTimeFormatters.set(locale, formatter)
    }
    return formatter
}

export function formatRelativeTime(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime()
    const rtf = relativeTimeFormatter()
    const mins = Math.floor(ms / 60_000)
    if (mins < 60) return rtf.format(-Math.max(1, mins), 'minute')
    const hours = Math.floor(ms / 3_600_000)
    if (hours < 24) return rtf.format(-hours, 'hour')
    const days = Math.floor(ms / 86_400_000)
    if (days < 30) return rtf.format(-days, 'day')
    const months = Math.floor(days / 30)
    if (months < 12) return rtf.format(-months, 'month')
    return rtf.format(-Math.floor(days / 365), 'year')
}
