export function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${parseFloat((bytes / 1024 / 1024).toFixed(1))} MB`
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
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

export function formatRelativeTime(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(ms / 60_000)
    if (mins < 60) return `${Math.max(1, mins)}m ago`
    const hours = Math.floor(ms / 3_600_000)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(ms / 86_400_000)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(days / 365)}y ago`
}
