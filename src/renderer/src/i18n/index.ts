import en from './en.json'

type DotPaths<T> = T extends string
    ? never
    : {
          [K in keyof T & string]: T[K] extends string
              ? K
              : T[K] extends object
                ? `${K}.${DotPaths<T[K]>}`
                : never
      }[keyof T & string]

export type StringKey = DotPaths<typeof en>

function get(key: StringKey): string {
    const parts = (key as string).split('.')
    let cur: unknown = en
    for (const part of parts) {
        if (typeof cur !== 'object' || cur === null) return key
        cur = (cur as Record<string, unknown>)[part]
    }
    return typeof cur === 'string' ? cur : key
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
    const value = get(key)
    if (!vars) return value
    return value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}
