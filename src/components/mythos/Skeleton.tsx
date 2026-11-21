/** Loading skeletons that match the shapes of the real content. */

import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('mythos-skeleton', className)} />
}

/** Announces loading to assistive tech while the visual skeleton shows. */
function Busy({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export function CardGridSkeleton({ count = 6, label = 'Loading…' }: { count?: number; label?: string }) {
  return (
    <Busy label={label} className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </Busy>
  )
}

export function ListSkeleton({ rows = 5, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <Busy label={label} className="divide-y divide-border rounded-xl border border-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </Busy>
  )
}

export function PageSkeleton({ label = 'Loading…' }: { label?: string }) {
  return (
    <Busy label={label} className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid gap-4 @xl:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </Busy>
  )
}

export function ArticleSkeleton() {
  return (
    <Busy label="Loading article…" className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <Skeleton className="h-56 w-full rounded-2xl" />
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </Busy>
  )
}
