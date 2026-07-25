import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * The zone card's silhouette.
 *
 * Deliberately the same shape and height as the real card, so the grid does not
 * reflow when data lands. A spinner would say "something is happening"; this
 * says "three zones are about to appear, here".
 */
export function ZoneCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 border-2 border-border/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-1.5 h-3 w-16" />
        </div>
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
      </div>

      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-24" />
    </Card>
  )
}
