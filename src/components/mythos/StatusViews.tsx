/** Shared loading / error / not-found views for Mythos pages. */

import { Link } from 'react-router-dom'

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}

export function ErrorView({ message }: { message: string }) {
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-foreground">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
    </div>
  )
}

export function NotFoundView({ what }: { what: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-semibold text-foreground">{what} not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted, or you may not have access to it.
      </p>
      <Link to="/universes" className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline">
        Back to your universes
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
  'h-10 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
