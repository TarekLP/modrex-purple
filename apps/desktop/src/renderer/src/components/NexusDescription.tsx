import { Children, isValidElement, type ReactNode } from 'react'
import * as bbcode from 'bbcode-to-react'
import { api } from '../api'

// Nexus mod descriptions are BBCode. Parsed here with the actual bbcode-to-react
// library, the same one Nexus's own mod manager Vortex uses (Nexus-Mods/Vortex,
// src/renderer/src/controls/bbcode/), instead of a hand-rolled regex approximation.
// A real tokenizing parser handles malformed input the way Vortex does. Regex can only
// match shapes it was written against.
const { Tag, Parser } = bbcode

// A textarea is RCDATA. Setting its innerHTML decodes entities without parsing markup
// as real elements.
function decodeEntities(text: string): string {
    const el = document.createElement('textarea')
    el.innerHTML = text
    return el.value
}

// Vortex's own preprocessing step: real description data mixes literal br HTML into
// otherwise-BBCode text, normalized into the br tag before parsing. Real Nexus data
// terminates every line with a newline directly followed by a literal br, so the
// newline is swallowed into the same match. Left as a separate text node it breaks the
// block-adjacency check in stripRedundantBreaks below.
function preprocess(text: string): string {
    return decodeEntities(text.replace(/\n?<br\s*\/?>\n?/gi, '[br][/br]'))
}

// Tag.getContent() always HTML-escapes its text (it exists to build a safe HTML
// string for toHTML). toReact has no string to escape into, so a value read this way
// for use as a raw prop (an image src, a bare url) needs the escape undone, or a real
// ampersand in a URL comes back out as the literal text "amp" entity form. Confirmed
// against a live Nexus mod whose button image lost all its styling this way, since its
// colors are set through the query string.
function decodeContentEscape(text: string): string {
    return decodeEntities(text)
}

// Vortex's own br tag, not a bbcode-to-react default.
class BrTag extends Tag {
    toReact() {
        return <br />
    }
}

// Vortex's own size override, a relative scale in rem rather than the base library's
// pixel size.
class SizeTag extends Tag {
    toReact() {
        const size = Number(this.params.size)
        if (Number.isNaN(size)) return Children.toArray(this.getComponents())
        return (
            <span style={{ fontSize: `${1 + size * 0.1}rem` }}>
                {Children.toArray(this.getComponents())}
            </span>
        )
    }
}

// Vortex's own line tag, a horizontal divider used unclosed in real descriptions.
class LineTag extends Tag {
    toReact() {
        return (
            <div>
                <hr className="border-t border-border my-3" />
                {Children.toArray(this.getComponents())}
            </div>
        )
    }
}

// Overrides the base library's own url, link and email tags (which open a plain
// target blank anchor) to route through api.openExternal instead, matching
// MarkdownContentImpl's own link handling. Mod descriptions are attacker controlled.
class LinkTag extends Tag {
    toReact() {
        // An explicit param (the equals form) comes straight from the raw token and
        // was never escaped. Only the getContent fallback (a bare url with no param)
        // needs the escape undone.
        let url = this.renderer.strip(
            this.params[this.name] || decodeContentEscape(this.getContent(true))
        )
        if (/javascript:/i.test(url)) url = ''
        if (!url.length) return Children.toArray(this.getComponents())
        if (this.name === 'email') url = `mailto:${url}`
        if (!/^(https?|mailto):/i.test(url)) return Children.toArray(this.getComponents())
        const href = url
        return (
            // eslint-disable-next-line no-restricted-syntax -- gated: scheme allowlisted above, click routed through api.openExternal
            <a
                href={href}
                onClick={(e) => {
                    e.preventDefault()
                    api.openExternal(href)
                }}
                className="text-accent-bright underline cursor-pointer"
            >
                {Children.toArray(this.getComponents())}
            </a>
        )
    }
}

// Matches MarkdownContentImpl's image handling instead of the base library's bare,
// unstyled img.
class ImageTag extends Tag {
    toReact() {
        const src = decodeContentEscape(this.getContent(true))
        if (!src.length) return null
        if (!/^https?:/i.test(src)) return null
        return <img src={src} alt="" loading="lazy" className="max-w-full rounded my-2" />
    }
}

const parser = new Parser()
parser.registerTag('br', BrTag)
parser.registerTag('size', SizeTag)
parser.registerTag('line', LineTag)
parser.registerTag('url', LinkTag)
parser.registerTag('link', LinkTag)
parser.registerTag('email', LinkTag)
parser.registerTag('img', ImageTag)

// A br immediately next to a block element's boundary is dead space, since the block
// already starts its own line. Confirmed against a real mod description where this
// doubled the visible spacing between every section.
const BLOCK_TYPES = new Set([
    'div',
    'blockquote',
    'ul',
    'ol',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
])

function isBr(node: ReactNode): boolean {
    return isValidElement(node) && node.type === 'br'
}

function isBlock(node: ReactNode): boolean {
    return isValidElement(node) && typeof node.type === 'string' && BLOCK_TYPES.has(node.type)
}

function stripRedundantBreaks(nodes: ReactNode[]): ReactNode[] {
    return nodes.filter(
        (node, i) => !isBr(node) || (!isBlock(nodes[i - 1]) && !isBlock(nodes[i + 1]))
    )
}

// No color class on strong or h1 through h3 here, deliberately. A hardcoded text color
// on these would beat an inherited color from an ancestor color tag's span style, so bold
// colored headings would render in the default text color instead.
const WRAPPER_CLASS =
    'text-sm text-text-muted leading-relaxed ' +
    '[&_strong]:font-semibold ' +
    '[&_h1]:font-semibold [&_h1]:text-base [&_h1]:mt-4 [&_h1]:mb-1 ' +
    '[&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-4 [&_h2]:mb-1 ' +
    '[&_h3]:font-semibold [&_h3]:text-sm [&_h3]:mt-4 [&_h3]:mb-1 ' +
    '[&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2 [&_li]:mb-0.5 ' +
    '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:my-2 ' +
    '[&_hr]:border-border [&_hr]:my-3'

export function NexusDescription({ text }: { text: string }) {
    const nodes = Children.toArray(parser.toReact(preprocess(text)))
    return <div className={WRAPPER_CLASS}>{stripRedundantBreaks(nodes)}</div>
}
