// bbcode-to-react ships no types of its own. Copied from Vortex, Nexus's own mod
// manager, which uses this exact library the same way. Kept loosely typed to match,
// rather than inventing stricter types for a third-party API this project doesn't own.
declare namespace BBCodeToReact {
    export class Tag {
        name: string
        params: Record<string, string>
        SELF_CLOSE: boolean
        STRIP_OUTER: boolean
        renderer: {
            escape: (value: string) => string
            strip: (value: string) => string
            htmlAttributes: (attrs?: Record<string, unknown>) => string
            context: <T>(context: Record<string, unknown>, fn: () => T) => T
            options: { linkify?: boolean; [key: string]: unknown }
        }

        constructor(renderer: unknown, settings: unknown)

        getComponents(): React.ReactNode[]
        getContent(raw?: boolean): string
        toHTML(): string | string[]
        toReact(): React.ReactNode
    }

    export class Parser {
        registerTag(name: string, tag: new (renderer: unknown, settings: unknown) => Tag): void
        toHTML(input: string): string | string[]
        toReact(input: string): React.ReactNode[]
    }
}

declare module 'bbcode-to-react' {
    export = BBCodeToReact
}
