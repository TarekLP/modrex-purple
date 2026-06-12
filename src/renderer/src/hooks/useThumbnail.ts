import { useState, useEffect } from 'react'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { getCachedThumbnailUrl, getLocalImage } from '../thumbnailCache'

// How long to wait for the local disk cache before falling back to the CDN.
// Disk hits resolve in single-digit milliseconds; only thumbnails the backend
// still has to download exceed this.
const LOCAL_RACE_MS = 50

// `full` selects the original image instead of the small thumbnail variant —
// used by the detail page's banner and lightbox.
export function useThumbnail(file: string | null | undefined, full = false): string | null {
    const [src, setSrc] = useState<string | null>(() => {
        if (!file) return null
        return getCachedThumbnailUrl(file, full) ?? null
    })

    useEffect(() => {
        if (!file) {
            setSrc(null)
            return
        }
        const cached = getCachedThumbnailUrl(file, full)
        if (cached) {
            setSrc(cached)
            return
        }
        // Race the disk cache against a short timeout: when the local image
        // wins, the CDN is never touched. When the CDN fallback fires first, keep
        // it for this mount — swapping src after the CDN image painted makes the
        // browser re-load the image (visible flicker). getLocalImage still
        // records the local URL so future mounts resolve synchronously.
        let cancelled = false
        const timer = setTimeout(() => {
            if (!cancelled) setSrc((prev) => prev ?? `${THUMBNAIL_BASE_URL}/${file}`)
        }, LOCAL_RACE_MS)
        getLocalImage(file, full)
            .then((url) => {
                if (cancelled) return
                clearTimeout(timer)
                setSrc((prev) => prev ?? url)
            })
            .catch(() => {})
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [file, full])

    return src
}
