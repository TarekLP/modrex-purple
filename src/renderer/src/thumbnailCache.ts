import { convertFileSrc } from '@tauri-apps/api/core'
import { api } from './api'

const resolved = new Map<string, string>()

export function getCachedThumbnailUrl(filename: string): string | undefined {
    return resolved.get(filename)
}

export async function getLocalThumbnail(filename: string): Promise<string> {
    const hit = resolved.get(filename)
    if (hit) return hit

    const localPath = await api.getThumbnail(filename)
    const url = convertFileSrc(localPath)
    resolved.set(filename, url)
    return url
}
