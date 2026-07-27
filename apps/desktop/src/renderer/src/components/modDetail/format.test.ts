import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockLocale = 'en'
vi.mock('../../i18n', () => ({
    getLocale: () => mockLocale,
}))

import { formatRelativeTime, formatDate } from './format'

function isoMinutesAgo(mins: number): string {
    return new Date(Date.now() - mins * 60_000).toISOString()
}

describe('formatRelativeTime', () => {
    beforeEach(() => {
        mockLocale = 'en'
    })

    it('formats minutes, hours, and days in English', () => {
        expect(formatRelativeTime(isoMinutesAgo(1))).toBe('1 min. ago')
        expect(formatRelativeTime(isoMinutesAgo(4 * 60))).toBe('4 hr. ago')
        expect(formatRelativeTime(isoMinutesAgo(3 * 24 * 60))).toBe('3 days ago')
    })

    it('formats with correct Russian grammar, not a bare signed number', () => {
        mockLocale = 'ru'
        const result = formatRelativeTime(isoMinutesAgo(4 * 60))
        expect(result).not.toMatch(/^-/)
        expect(result).toContain('назад')
    })
})

describe('formatDate', () => {
    it('uses the active app locale, not the system default', () => {
        mockLocale = 'ru'
        const ru = formatDate('2024-03-15T00:00:00Z')
        mockLocale = 'en'
        const en = formatDate('2024-03-15T00:00:00Z')
        expect(ru).not.toBe(en)
    })
})
