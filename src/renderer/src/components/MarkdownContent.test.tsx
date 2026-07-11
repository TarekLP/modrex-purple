// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MarkdownContent } from './MarkdownContentImpl'
import { api } from '../api'

vi.mock('../api', () => ({ api: { openExternal: vi.fn() } }))

// Mod descriptions come from modworkshop authors, i.e. they are attacker-controlled.
// These tests feed hostile payloads through the full component to pin both layers:
// rehype-sanitize (schema) and the component-level gates (scheme allowlist, embed
// host allowlist).
describe('MarkdownContent sanitization', () => {
    afterEach(cleanup)

    it('strips <script> elements while keeping surrounding text', () => {
        const { container, getByText } = render(
            <MarkdownContent text={'before<script>window.pwned = true</script>after'} />
        )
        expect(container.querySelector('script')).toBeNull()
        expect(getByText(/before/)).toBeTruthy()
        expect(getByText(/after/)).toBeTruthy()
    })

    it('strips inline event handlers but keeps the image', () => {
        const { container } = render(
            <MarkdownContent
                text={'<img src="https://example.com/a.png" onerror="window.pwned = true">'}
            />
        )
        const img = container.querySelector('img')
        expect(img?.getAttribute('src')).toBe('https://example.com/a.png')
        expect(img?.getAttribute('onerror')).toBeNull()
    })

    it('removes style, object, and embed elements', () => {
        const { container } = render(
            <MarkdownContent
                text={
                    '<style>body{display:none}</style><object data="https://example.com/x"></object><embed src="https://example.com/x">'
                }
            />
        )
        expect(container.querySelector('style')).toBeNull()
        expect(container.querySelector('object')).toBeNull()
        expect(container.querySelector('embed')).toBeNull()
    })

    it('renders javascript: links as plain text, not anchors', () => {
        const { container, getByText } = render(
            <MarkdownContent text={'[click me](javascript:alert(1))'} />
        )
        expect(container.querySelector('a')).toBeNull()
        expect(getByText('click me')).toBeTruthy()
    })

    it('routes safe link clicks through the gated external opener', () => {
        const { container } = render(<MarkdownContent text={'[site](https://example.com/)'} />)
        const anchor = container.querySelector('a')
        expect(anchor).not.toBeNull()
        // No real href, so navigation is impossible even if the click handler regressed
        expect(anchor?.getAttribute('href')).toBeNull()
        fireEvent.click(anchor!)
        expect(vi.mocked(api.openExternal)).toHaveBeenCalledWith('https://example.com/')
    })

    it('drops iframes from hosts outside the embed allowlist', () => {
        const { container } = render(
            <MarkdownContent text={'<iframe src="https://evil.example/payload"></iframe>'} />
        )
        expect(container.querySelector('iframe')).toBeNull()
    })

    it('renders allowlisted video iframes as the click-to-play player, not a live iframe', () => {
        const { container } = render(
            <MarkdownContent
                text={'<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'}
            />
        )
        expect(container.querySelector('iframe')).toBeNull()
        const thumb = container.querySelector('img')
        expect(thumb?.getAttribute('src')).toBe(
            'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        )
    })

    it('keeps modworkshop color tags working', () => {
        const { getByText } = render(<MarkdownContent text={'{#ff0000}(hot text)'} />)
        expect(getByText('hot text').style.color).toBe('rgb(255, 0, 0)')
    })

    it('keeps syntax-highlight classes (sanitize must run before rehype-highlight)', () => {
        const { container } = render(<MarkdownContent text={'```js\nconst x = 1\n```'} />)
        expect(container.querySelector('.hljs-keyword')).not.toBeNull()
    })
})
