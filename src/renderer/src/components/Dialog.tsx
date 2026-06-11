import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    children: ReactNode
    className?: string
}

export function Dialog({ open, onOpenChange, title, children, className }: Props) {
    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
                <RadixDialog.Content
                    className={`fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-surface-raised border border-border rounded-xl shadow-xl flex flex-col overflow-hidden focus:outline-none text-text ${className ?? ''}`}
                >
                    <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
                    {children}
                </RadixDialog.Content>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    )
}
