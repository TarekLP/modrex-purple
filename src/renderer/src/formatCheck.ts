export const SUPPORTED_FORMATS = new Set(['pak', 'zip', '7z', 'rar'])

export function isUnsupportedFormat(type: string | undefined, downloadUrl?: string): boolean {
    if (type) return !SUPPORTED_FORMATS.has(type.toLowerCase())
    if (!downloadUrl) return false
    try {
        const filename = (new URL(downloadUrl).pathname.split('/').pop() ?? '').toLowerCase()
        if (filename.endsWith('.tar.gz') || filename.endsWith('.tar.xz')) return false
        const dot = filename.lastIndexOf('.')
        if (dot < 0 || dot === filename.length - 1) return false
        return !SUPPORTED_FORMATS.has(filename.slice(dot + 1))
    } catch {
        return false
    }
}
