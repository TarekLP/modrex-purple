import { convertFileSrc } from '@tauri-apps/api/core'
import { api } from './api'

const resolved = new Map<string, string>()

const variantKey = (filename: string, full: boolean) => (full ? `full:${filename}` : filename)

export function getCachedThumbnailUrl(filename: string, full = false): string | undefined {
    return resolved.get(variantKey(filename, full))
}

// Drops the in-memory URL dedup map after the disk cache is cleared, so the
// next request re-downloads instead of resolving to a now-deleted file.
export function clearResolvedThumbnails(): void {
    resolved.clear()
}

export async function getLocalImage(filename: string, full = false): Promise<string> {
    const key = variantKey(filename, full)
    const hit = resolved.get(key)
    if (hit) return hit

    // Ensures the file exists in the disk cache, downloading if missing, so the
    // thumb:// protocol serves it from there with immutable cache headers, so
    // the webview reuses decoded images across page remounts. The returned
    // cache name is Rust's to choose (small thumbnail variant or full image).
    const cacheName = await api.getThumbnail(filename, full)
    const url = convertFileSrc(cacheName, 'thumb')
    resolved.set(key, url)
    return url
}
