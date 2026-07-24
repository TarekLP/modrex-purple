import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

// Height envelopes keep content-variable modals from resizing (and re-centering)
// as their content changes. 'panel' is a fixed height for tabbed modals whose body
// swaps in place; 'list' is a floor+ceiling band for single scrolling lists; 'auto'
// leaves the height content-driven for static confirm dialogs.
const sizeClasses = {
    auto: '',
    list: 'min-h-[20rem] max-h-[75vh]',
    panel: 'h-[34rem] max-h-[80vh]',
} as const

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    children: ReactNode
    className?: string
    size?: keyof typeof sizeClasses
    onOpenAutoFocus?: (event: Event) => void
}

export function Dialog({
    open,
    onOpenChange,
    title,
    children,
    className,
    size = 'auto',
    onOpenAutoFocus,
}: Props) {
    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
                <RadixDialog.Content
                    onOpenAutoFocus={onOpenAutoFocus}
                    className={`fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-surface-raised border border-border rounded-xl shadow-xl flex flex-col overflow-hidden focus:outline-none text-text ${sizeClasses[size]} ${className ?? ''}`}
                >
                    <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
                    {children}
                </RadixDialog.Content>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    )
}
