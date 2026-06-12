import { convertFileSrc } from '@tauri-apps/api/core'
import { api } from './api'

const resolved = new Map<string, string>()

export function getCachedThumbnailUrl(filename: string): string | undefined {
    return resolved.get(filename)
}

export async function getLocalThumbnail(filename: string): Promise<string> {
    const hit = resolved.get(filename)
    if (hit) return hit

    // Ensures the file exists in the disk cache (downloads if missing) — the
    // thumb:// protocol serves it from there with immutable cache headers, so
    // the webview reuses decoded images across page remounts. The returned
    // cache name is Rust's to choose (currently the small thumbnail variant).
    const cacheName = await api.getThumbnail(filename)
    const url = convertFileSrc(cacheName, 'thumb')
    resolved.set(filename, url)
    return url
}
