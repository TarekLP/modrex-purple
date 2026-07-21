import { SkeletonBar } from './Skeleton'

export function SkeletonCard() {
    return (
        <div
            className="h-full bg-surface-raised border border-border rounded-lg overflow-hidden flex flex-col animate-pulse"
            aria-hidden="true"
        >
            <SkeletonBar className="w-full h-36 rounded-none" />
            <div className="px-3 pt-3 pb-1 flex flex-col gap-2">
                <SkeletonBar className="h-3 w-3/4" />
                <SkeletonBar className="h-2.5 w-1/3" />
                <SkeletonBar className="h-2.5 w-full" />
                <SkeletonBar className="h-2.5 w-2/3" />
            </div>
            <div className="px-3 pb-3 pt-2 flex items-center justify-between mt-auto">
                <SkeletonBar className="h-2.5 w-1/4" />
                <SkeletonBar className="h-7 w-16" />
            </div>
        </div>
    )
}
