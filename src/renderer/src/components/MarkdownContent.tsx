import ReactMarkdown from 'react-markdown'

export function MarkdownContent({ text }: { text: string }) {
    return (
        <ReactMarkdown
            components={{
                p: ({ children }) => (
                    <p className="text-sm text-text-muted leading-relaxed mb-2">{children}</p>
                ),
                h1: ({ children }) => (
                    <h1 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h1>
                ),
                h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h2>
                ),
                h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h3>
                ),
                h4: ({ children }) => (
                    <h4 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h4>
                ),
                ul: ({ children }) => (
                    <ul className="list-disc ml-5 mb-2 text-sm text-text-muted">{children}</ul>
                ),
                ol: ({ children }) => (
                    <ol className="list-decimal ml-5 mb-2 text-sm text-text-muted">{children}</ol>
                ),
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                a: ({ href, children }) => (
                    <a
                        onClick={(e) => {
                            e.preventDefault()
                            href && window.api.openExternal(href)
                        }}
                        className="text-accent-bright underline cursor-pointer"
                    >
                        {children}
                    </a>
                ),
                strong: ({ children }) => (
                    <strong className="font-semibold text-text">{children}</strong>
                ),
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children }) => (
                    <code className="font-mono text-[0.85em] bg-surface-hover px-1 py-0.5 rounded">
                        {children}
                    </code>
                ),
                img: ({ src, alt }) => (
                    <img src={src} alt={alt} loading="lazy" className="max-w-full rounded my-2" />
                ),
                hr: () => <hr className="border-none border-t border-border my-3" />,
            }}
        >
            {text}
        </ReactMarkdown>
    )
}
