/** Explore: public universes any signed-in user can read and join (ADR-024). */

import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { EmptyState, SearchInput } from '@/components/ui'
import { PublicUniverseCard } from '@/components/mythos/PublicUniverse'
import { CardGridSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView } from '@/components/mythos/StatusViews'
import { usePublicUniverses } from '@/features/public/hooks'

export default function ExplorePage() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  // Search as the user types, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300)
    return () => clearTimeout(t)
  }, [input])
  const { data, status, error, reload } = usePublicUniverses(query)

  return (
    <div className="mythos-atmosphere @container min-h-full">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header>
          <p className="mythos-eyebrow">Explore</p>
          <h1 className="mt-2 text-4xl font-semibold text-foreground sm:text-5xl">Public universes</h1>
          <p className="mt-2 max-w-xl font-serif text-lg italic text-muted-foreground">
            Worlds their creators have opened to every Mythos reader.
          </p>
        </header>

        <div className="mt-8 max-w-md">
          <SearchInput
            aria-label="Search public universes"
            placeholder="Search by name or tagline"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onClear={() => setInput('')}
            data-testid="explore-search"
          />
        </div>

        <div className="mythos-rule my-10" aria-hidden>
          ✦
        </div>

        {status === 'loading' ? (
          <CardGridSkeleton count={6} label="Loading public universes…" />
        ) : status === 'error' || !data ? (
          <ErrorView message={error ?? 'Public universes could not be loaded.'} onRetry={() => void reload()} />
        ) : data.universes.length === 0 ? (
          <EmptyState
            icon={<Compass className="size-6" />}
            title={query ? 'No public universes match' : 'No public universes yet'}
            description={
              query
                ? 'Try another name or word from a tagline.'
                : 'When an owner makes their universe public in its settings, it appears here.'
            }
          />
        ) : (
          <>
            <div className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3" data-testid="public-universe-grid">
              {data.universes.map((u) => (
                <PublicUniverseCard key={u.id} universe={u} />
              ))}
            </div>
            {data.total > data.universes.length && (
              <p className="mt-6 text-sm text-muted-foreground">
                Showing the {data.universes.length} most recently updated of {data.total}. Search to narrow them down.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
