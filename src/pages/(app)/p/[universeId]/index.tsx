/**
 * A public universe's home for any signed-in reader (ADR-024): details,
 * published articles and the categories that hold them, loaded through
 * `getPublicUniverse`. A private universe the caller is not in answers
 * "not found", same as a missing one.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BookOpenText } from 'lucide-react'
import { EmptyState, SearchInput } from '@/components/ui'
import { CoverImage } from '@/components/mythos/CoverImage'
import { PublicArticleCard, PublicMembershipBar } from '@/components/mythos/PublicUniverse'
import { PageSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, NotFoundView, selectClass } from '@/components/mythos/StatusViews'
import { usePublicUniverse } from '@/features/public/hooks'
import { relativeTime } from '@/lib/format'

export default function PublicUniversePage() {
  const { universeId = '' } = useParams()
  const { data, status, error, reload } = usePublicUniverse(universeId)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')

  const categoryName = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c.name])), [data])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.articles ?? []).filter(
      (a) =>
        (!category || a.categoryId === category) &&
        (!q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q))),
    )
  }, [data, search, category])

  if (status === 'loading') return <PageSkeleton label="Opening the universe…" />
  if (status === 'error' || !data) {
    if (error === 'Universe not found') return <NotFoundView what="Universe" backTo="/explore" backLabel="Back to Explore" />
    return <ErrorView message={error ?? 'This universe could not be loaded.'} onRetry={() => void reload()} />
  }

  const { universe, myRole, articles, categories } = data
  return (
    <div className="@container min-h-full pb-16">
      <header className="relative">
        <div className="h-48 overflow-hidden sm:h-60">
          <CoverImage imageKey={universe.coverImageKey} title={universe.name} seed={universe.id} monogramClassName="text-8xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-shell-panel via-shell-panel/50 to-transparent" />
      </header>

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-8 px-6">
        <div>
          <p className="mythos-eyebrow">Public universe · by {universe.ownerName}</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight text-foreground sm:text-5xl" data-testid="public-universe-name">
            {universe.name}
          </h1>
          {universe.tagline && <p className="mt-2 font-serif text-xl italic text-muted-foreground">{universe.tagline}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Updated {relativeTime(universe.updatedAt)}</p>
        </div>

        <PublicMembershipBar universeId={universe.id} universeName={universe.name} myRole={myRole} />

        {universe.description && (
          <p className="max-w-3xl whitespace-pre-line font-serif text-lg leading-relaxed text-foreground">{universe.description}</p>
        )}

        <div className="mythos-rule" aria-hidden>
          ✦
        </div>

        <section aria-labelledby="public-articles-heading" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="public-articles-heading" className="text-2xl font-semibold text-foreground">
              Articles <span className="text-base font-normal text-muted-foreground">({articles.length})</span>
            </h2>
            {articles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <SearchInput
                  aria-label="Search articles"
                  placeholder="Search articles"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => setSearch('')}
                />
                {categories.length > 0 && (
                  <select
                    aria-label="Filter by category"
                    className={selectClass}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {articles.length === 0 ? (
            <EmptyState
              icon={<BookOpenText className="size-6" />}
              title="Nothing published yet"
              description="Articles appear here once the authors publish them."
            />
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No articles match. Try another search or category.</p>
          ) : (
            <div className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3" data-testid="public-article-grid">
              {shown.map((a) => (
                <PublicArticleCard key={a.id} article={a} universeId={universe.id} categoryName={categoryName.get(a.categoryId)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
