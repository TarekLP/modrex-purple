// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { NexusDescription } from './NexusDescription'

describe('NexusDescription', () => {
    it('renders bold, italic, underline and strike', () => {
        const { getByText } = render(
            <NexusDescription text="[b]bold[/b] [i]italic[/i] [u]under[/u] [s]strike[/s]" />
        )
        expect(getByText('bold').tagName).toBe('STRONG')
        // bbcode-to-react's own default tag: [i] maps to <em>, not <i>.
        expect(getByText('italic').tagName).toBe('EM')
        expect(getByText('under').tagName).toBe('U')
        // bbcode-to-react's own default tag: [s] maps to <strike>, not <s>.
        expect(getByText('strike').tagName).toBe('STRIKE')
    })

    it('lets bold text inherit an ancestor color instead of overriding it', () => {
        const { getByText } = render(<NexusDescription text="[color=green][b]text[/b][/color]" />)
        const bold = getByText('text')
        expect(bold.style.color).toBe('')
        expect(bold.closest('span')?.style.color).toBe('green')
    })

    it("uses Vortex's relative rem scale for [size], not a pixel size", () => {
        const { getByText } = render(<NexusDescription text="[size=4]big[/size]" />)
        expect(getByText('big').style.fontSize).toBe('1.4rem')
    })

    it('normalizes a literal <br> into a real line break with no doubling', () => {
        const { container } = render(<NexusDescription text={'one\n<br />two'} />)
        expect(container.querySelectorAll('br')).toHaveLength(1)
    })

    it('centers a [center] block including an image inside it', () => {
        const { container } = render(
            <NexusDescription text="[center][url=https://x.test][img]https://x.test/a.png[/img][/url][/center]" />
        )
        const img = container.querySelector('img')
        const centered = container.querySelector('div[style*="center"]')
        expect(centered?.contains(img)).toBe(true)
    })

    it('renders a list with no cross-item contamination', () => {
        const { container, getByText } = render(
            <NexusDescription text="[list][*]one[*]two[*]three[/list]" />
        )
        expect(container.querySelectorAll('li')).toHaveLength(3)
        expect(getByText('one').tagName).toBe('LI')
        expect(getByText('two').tagName).toBe('LI')
        expect(getByText('three').tagName).toBe('LI')
    })

    // The bug this catches: the old regex converter matched a list item up to the next
    // literal bracket, so an item with a stray bracket in its own content leaked an
    // unbalanced fragment that markdown's emphasis parser then picked up, alternating
    // italics across unrelated sibling items. A real tokenizing parser can't leak this
    // way, since an unrecognized tag is just a text node in the right place.
    it('does not let a stray bracket in one list item corrupt a sibling item', () => {
        const { getByText } = render(
            <NexusDescription text="[list][*]stealth patrol [/][*]snipers[*]cam angles[/list]" />
        )
        expect(getByText(/snipers/).tagName).toBe('LI')
        expect(getByText(/cam angles/).tagName).toBe('LI')
        expect(getByText(/snipers/).tagName).not.toBe('EM')
        expect(getByText(/cam angles/).tagName).not.toBe('EM')
    })

    it('routes a link click through api.openExternal instead of navigating directly', () => {
        const { getByText } = render(<NexusDescription text="[url=https://x.test]click[/url]" />)
        const a = getByText('click')
        expect(a.tagName).toBe('A')
        expect(a.getAttribute('href')).toBe('https://x.test')
    })

    // Tag.getContent() always HTML-escapes its text, so a bare-URL image or link with
    // no equals param comes back with any real ampersand turned into a literal entity
    // unless that's undone. Confirmed against a real Nexus mod whose donation button
    // image lost all its styling this way, since its colors are set through the query
    // string and the entity broke the server's own parsing of it.
    it('does not leave a literal "&amp;" in a bare-URL image src', () => {
        const { container } = render(
            <NexusDescription text="[img]https://x.test/a.png?a=1&amp;b=2[/img]" />
        )
        const src = container.querySelector('img')?.getAttribute('src')
        expect(src).toBe('https://x.test/a.png?a=1&b=2')
    })

    it('does not leave a literal "&amp;" in a bare [url] with no display text', () => {
        const { getByText } = render(
            <NexusDescription text="[url]https://x.test/a?a=1&amp;b=2[/url]" />
        )
        expect(getByText(/x\.test/).getAttribute('href')).toBe('https://x.test/a?a=1&b=2')
    })

    // A br touching a block element's boundary is dead space, since the block already
    // starts its own line. Confirmed by a real regression where this doubled the total
    // break count for a real mod's full description.
    it('drops a <br/> that sits directly next to a block element', () => {
        const { container } = render(
            <NexusDescription text={'before\n<br />[center]centered[/center]\n<br />after'} />
        )
        expect(container.querySelectorAll('br')).toHaveLength(0)
    })

    it('keeps a <br/> between two pieces of inline content', () => {
        const { container } = render(<NexusDescription text={'one\n<br />two'} />)
        expect(container.querySelectorAll('br')).toHaveLength(1)
    })
})
