export function SkeletonCard() {
    return (
        <div className="h-full bg-surface-raised border border-border rounded-lg overflow-hidden flex flex-col animate-pulse">
            <div className="w-full h-36 bg-surface-hover" />
            <div className="px-3 pt-3 pb-1 flex flex-col gap-2">
                <div className="h-3 bg-surface-hover rounded w-3/4" />
                <div className="h-2.5 bg-surface-hover rounded w-1/3" />
                <div className="h-2.5 bg-surface-hover rounded w-full" />
                <div className="h-2.5 bg-surface-hover rounded w-2/3" />
            </div>
            <div className="px-3 pb-3 pt-2 flex items-center justify-between mt-auto">
                <div className="h-2.5 bg-surface-hover rounded w-1/4" />
                <div className="h-7 bg-surface-hover rounded w-16" />
            </div>
        </div>
    )
}
