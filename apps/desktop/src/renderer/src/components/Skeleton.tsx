import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function SkeletonBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('rounded bg-surface-hover', className)} {...props} />
}

export function SkeletonText({ className }: { className?: string }) {
    return (
        <div className={cn('flex flex-col gap-2 animate-pulse', className)} aria-hidden="true">
            <SkeletonBar className="h-2.5 w-full" />
            <SkeletonBar className="h-2.5 w-5/6" />
            <SkeletonBar className="h-2.5 w-2/3" />
        </div>
    )
}
