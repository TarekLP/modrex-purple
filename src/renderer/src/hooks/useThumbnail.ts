import { useState, useEffect } from 'react'
import { THUMBNAIL_BASE_URL } from '../../../shared/types'
import { getCachedThumbnailUrl, getLocalThumbnail } from '../thumbnailCache'

export function useThumbnail(file: string | null | undefined): string | null {
    const [src, setSrc] = useState<string | null>(() => {
        if (!file) return null
        return getCachedThumbnailUrl(file) ?? `${THUMBNAIL_BASE_URL}/${file}`
    })

    useEffect(() => {
        if (!file) {
            setSrc(null)
            return
        }
        const cached = getCachedThumbnailUrl(file)
        if (cached) {
            setSrc(cached)
            return
        }
        setSrc(`${THUMBNAIL_BASE_URL}/${file}`)
        getLocalThumbnail(file)
            .then(setSrc)
            .catch(() => {})
    }, [file])

    return src
}
