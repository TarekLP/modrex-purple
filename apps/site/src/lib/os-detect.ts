export interface OsInfo {
    isMobile: boolean
    isLinux: boolean
}

// Shared client-side OS detection for the download buttons in Hero, DownloadSection, and Nav.
// The maxTouchPoints branch catches iPadOS 13+, which reports its user agent as macOS.
export function detectOs(): OsInfo {
    const isMobile =
        /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))
    const isLinux = /Linux|X11/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)
    return { isMobile, isLinux }
}
