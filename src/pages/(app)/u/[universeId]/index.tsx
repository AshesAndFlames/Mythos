/** Universe dashboard: cover, description, statistics, recent articles, quick actions. */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenText, Feather, Library } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { TYPE_ICONS } from '@/components/mythos/Badges'
import { ArticleCard } from '@/components/mythos/Cards'
import { CoverImage } from '@/components/mythos/CoverImage'
import { CardGridSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView } from '@/components/mythos/StatusViews'
import { ARTICLE_TYPE_LABELS, ARTICLE_TYPES } from '@/domain/mythos'
import { useUniverseContext } from '@/features/universes/context'
import { combine, useArticles, useCategories, useLinks, useMembers, useTags } from '@/features/universes/hooks'
import { plural } from '@/lib/format'
import { hasAtLeast } from '@/server/mythos/roles'

export default function UniverseOverview() {
  const { universe, role, newArticle } = useUniverseContext()
  const canEdit = hasAtLeast(role, 'editor')
  const { articles, status: articleStatus } = useArticles(universe.id)
  const { categories, status: categoryStatus } = useCategories(universe.id)
  const { links } = useLinks(universe.id)
  const { members } = useMembers(universe.id)
  const { byArticle } = useTags(universe.id)
  const status = combine(articleStatus, categoryStatus)
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  const stats = useMemo(() => {
    const byType = new Map<string, number>()
    let published = 0
    for (const a of articles) {
      byType.set(a.type, (byType.get(a.type) ?? 0) + 1)
      if (a.status === 'published') published++
    }
    return { byType, published, drafts: articles.length - published }
  }, [articles])

  return (
    <div className="pb-16">
      <header className="relative">
        <div className="h-56 overflow-hidden sm:h-72">
          <CoverImage imageKey={universe.coverImageKey} title={universe.name} seed={universe.id} monogramClassName="text-8xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-shell-panel via-shell-panel/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl px-6 pb-6">
          <p className="mythos-eyebrow">Universe</p>
          <h1 className="mt-1 text-4xl font-semibold leading-tight text-foreground sm:text-5xl" data-testid="universe-name">
            {universe.name}
          </h1>
          {universe.tagline && <p className="mt-2 max-w-2xl font-serif text-lg italic text-muted-foreground">{universe.tagline}</p>}
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-10 px-6 pt-6">
        {universe.description && (
          <p className="max-w-3xl whitespace-pre-line font-serif text-base leading-relaxed text-foreground/85">{universe.description}</p>
        )}

        <section aria-label="Statistics" className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <Stat label="Articles" value={articles.length} testId="stat-articles" />
          <Stat label="Published" value={stats.published} />
          <Stat label="Relationships" value={links.length} />
          <Stat label="Members" value={members.length} />
        </section>

        {canEdit && (
          <section aria-labelledby="quick-heading">
            <h2 id="quick-heading" className="mythos-eyebrow mb-3">
              Quick create
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={newArticle}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Feather className="size-4" aria-hidden /> New article
              </button>
              <Link
                to={`/u/${universe.id}/articles`}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:border-primary/40"
              >
                <Library className="size-4" aria-hidden /> Manage categories
              </Link>
            </div>
          </section>
        )}

        {articles.length > 0 && (
          <section aria-labelledby="types-heading">
            <h2 id="types-heading" className="mythos-eyebrow mb-3">
              By type
            </h2>
            <ul className="flex flex-wrap gap-2">
              {ARTICLE_TYPES.filter((t) => stats.byType.has(t)).map((t) => {
                const Icon = TYPE_ICONS[t]
                return (
                  <li key={t}>
                    <Link
                      to={`/u/${universe.id}/articles?type=${t}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:border-primary/40"
                    >
                      <Icon className="size-4 text-primary" aria-hidden />
                      {ARTICLE_TYPE_LABELS[t]}
                      <span className="text-xs text-muted-foreground">{stats.byType.get(t)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section aria-labelledby="recent-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="recent-heading" className="text-2xl font-semibold text-foreground">
                Recently written
              </h2>
              <p className="text-sm text-muted-foreground">
                {plural(articles.length, 'article')}
                {canEdit && stats.drafts > 0 ? ` · ${plural(stats.drafts, 'draft')}` : ''}
              </p>
            </div>
            {articles.length > 0 && (
              <Link to={`/u/${universe.id}/articles`} className="text-sm text-primary hover:underline">
                Open the library →
              </Link>
            )}
          </div>
          {status === 'loading' ? (
            <CardGridSkeleton count={3} label="Loading articles…" />
          ) : status === 'error' ? (
            <ErrorView message="Articles could not be loaded. Refresh to try again." />
          ) : articles.length === 0 ? (
            <EmptyState
              icon={<BookOpenText className="size-6" />}
              title="This world is still unwritten"
              description={
                canEdit
                  ? 'Start with a character, a place or a legend. Everything you write here is shared with the members of this universe.'
                  : 'Nothing has been written yet. Check back once the editors have started.'
              }
              action={canEdit ? { label: 'Write the first article', onClick: newArticle } : undefined}
            />
          ) : (
            <div className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3" data-testid="recent-articles">
              {articles.slice(0, 6).map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  universeId={universe.id}
                  categoryName={categoryName.get(a.categoryId)}
                  tags={byArticle.get(a.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="font-display text-3xl font-semibold tabular-nums text-foreground" data-testid={testId}>
        {value}
      </p>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
