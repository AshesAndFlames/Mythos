/** Shared loading / error / not-found views and small form helpers. */

import { Link } from 'react-router-dom'
import { AlertTriangle, Compass } from 'lucide-react'

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
      <span className="animate-pulse">{label}</span>
    </div>
  )
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-md gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-foreground">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 text-primary underline-offset-4 hover:underline">
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

export function NotFoundView({ what, backTo = '/universes', backLabel = 'Back to your universes' }: { what: string; backTo?: string; backLabel?: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md px-6 text-center">
      <Compass className="mx-auto size-10 text-primary/60" aria-hidden />
      <h1 className="mt-4 text-3xl font-semibold text-foreground">{what} not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted, or you may not have access to it.
      </p>
      <Link to={backTo} className="mt-5 inline-block text-sm text-primary underline-offset-4 hover:underline">
        {backLabel}
      </Link>
    </div>
  )
}

export function FormError({ message, testId }: { message: string | null; testId?: string }) {
  if (!message) return null
  return (
    <p role="alert" data-testid={testId} className="text-sm text-destructive">
      {message}
    </p>
  )
}

export const selectClass =
  'h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
