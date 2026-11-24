/** Article detail: cover, title, type, summary, live body, metadata, relationships. */

import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { History, PenLine } from 'lucide-react'
import { CategoryBadge, StatusBadge, TagChip, TypeBadge } from '@/components/mythos/Badges'
import { ArticleMiniCard } from '@/components/mythos/Cards'
import { CoverImage } from '@/components/mythos/CoverImage'
import { ArticleMediaStrip } from '@/components/mythos/Media'
import { ConnectionsSection, useConnections } from '@/components/mythos/Relationships'
import { RichTextView } from '@/components/mythos/RichTextEditor'
import { ArticleSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, NotFoundView } from '@/components/mythos/StatusViews'
import { useUniverseContext } from '@/features/universes/context'
import {
  combine,
  useArticle,
  useArticleMedia,
  useArticleRevisions,
  useCategories,
  useLinks,
  useTags,
  useUserNames,
} from '@/features/universes/hooks'
import { longDate, relativeTime } from '@/lib/format'
import { hasAtLeast } from '@/server/mythos/roles'

export default function ArticlePage() {
  const { articleId = '' } = useParams()
  const { universe, role } = useUniverseContext()
  const canEdit = hasAtLeast(role, 'editor')
  const { article, articles, status: articleStatus } = useArticle(universe.id, articleId)
  const { categories } = useCategories(universe.id)
  const { byArticle } = useTags(universe.id)
  const { links, status: linkStatus } = useLinks(universe.id)
  const { revisions } = useArticleRevisions(universe.id, articleId)
  const { attached } = useArticleMedia(universe.id, articleId)
  const names = useUserNames()
  const connections = useConnections(articleId, links, articles)
  const status = combine(articleStatus, linkStatus)

  const tags = byArticle.get(articleId) ?? []
  const category = categories.find((c) => c.id === article?.categoryId)

  /** Same category or a shared tag, not already linked; best matches first. */
  const related = useMemo(() => {
    if (!article) return []
    const linked = new Set(connections.flatMap((g) => g.items.map((i) => i.other.id)))
    const mine = new Set(tags)
    return articles
      .filter((a) => a.id !== article.id && !linked.has(a.id))
      .map((a) => {
        let score = 0
        if (article.categoryId && a.categoryId === article.categoryId) score += 2
        for (const t of byArticle.get(a.id) ?? []) if (mine.has(t)) score += 1
        return { a, score }
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || y.a.updatedAt.localeCompare(x.a.updatedAt))
      .slice(0, 5)
      .map((x) => x.a)
  }, [article, articles, connections, tags, byArticle])

  if (status === 'loading') return <ArticleSkeleton />
  if (status === 'error') return <ErrorView message="This article could not be loaded. Refresh to try again." />
  if (!article) return <NotFoundView what="Article" backTo={`/u/${universe.id}/articles`} backLabel="Back to the library" />

  const latest = revisions[0]

  return (
    <article className="pb-16">
      <header className="relative">
        <div className="h-52 overflow-hidden sm:h-64">
          <CoverImage imageKey={article.coverImageKey} title={article.title} seed={article.id} monogramClassName="text-8xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-shell-panel via-shell-panel/50 to-transparent" />
      </header>

      <div className="mx-auto -mt-20 grid max-w-6xl gap-10 px-6 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link to={`/u/${universe.id}/articles`} className="hover:text-foreground">
              Library
            </Link>
            {category && (
              <>
                {' / '}
                <Link to={`/u/${universe.id}/articles?category=${encodeURIComponent(category.id)}`} className="hover:text-foreground">
                  {category.name}
                </Link>
              </>
            )}
          </nav>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TypeBadge type={article.type} />
            {canEdit && <StatusBadge status={article.status} />}
          </div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl" data-testid="article-title">
              {article.title}
            </h1>
            {canEdit && (
              <Link
                to={`/u/${universe.id}/a/${article.id}/edit`}
                data-testid="edit-article"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <PenLine className="size-4" aria-hidden /> Edit
              </Link>
            )}
          </div>
          {article.summary && (
            <p className="mt-4 max-w-3xl font-serif text-xl italic leading-relaxed text-muted-foreground" data-testid="article-summary">
              {article.summary}
            </p>
          )}
          <div className="mythos-rule my-8" aria-hidden>
            ✦
          </div>
          <RichTextView articleId={article.id} />
          {attached.length > 0 && (
            <div className="mt-10">
              <ArticleMediaStrip items={attached} />
            </div>
          )}
          <div className="mt-12">
            <ConnectionsSection
              groups={connections}
              universeId={universe.id}
              articleTitle={article.title}
              canEdit={canEdit}
              emptyText={canEdit ? 'Not connected to anything yet. Add connections from the editor.' : 'Not connected to anything yet.'}
              footer={
                canEdit ? (
                  <Link to={`/u/${universe.id}/a/${article.id}/edit`} className="text-sm text-primary hover:underline">
                    + Add a connection
                  </Link>
                ) : undefined
              }
            />
          </div>
        </div>

        <aside className="space-y-8 @4xl:pt-24" aria-label="About this article">
          <section aria-label="Details" className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
            <Meta label="Category">{category ? <CategoryBadge name={category.name} /> : <span className="text-muted-foreground">None</span>}</Meta>
            <Meta label="Tags">
              {tags.length ? (
                <span className="flex flex-wrap gap-x-2" data-testid="article-tags">
                  {tags.map((t) => (
                    <TagChip key={t} name={t} />
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </Meta>
            <Meta label="Written by">{names.get(article.authorId) ?? 'Unknown'}</Meta>
            <Meta label="Created">{longDate(article.createdAt)}</Meta>
            <Meta label="Updated">{relativeTime(article.updatedAt)}</Meta>
            {latest && (
              <Meta label="Saved versions">
                <span className="inline-flex items-center gap-1">
                  <History className="size-3.5 text-muted-foreground" aria-hidden />
                  {revisions.length} · last by {names.get(latest.authorId) ?? 'Unknown'}
                </span>
              </Meta>
            )}
          </section>


          {related.length > 0 && (
            <section aria-labelledby="related-heading">
              <h3 id="related-heading" className="mythos-eyebrow mb-2">
                Related articles
              </h3>
              <div className="space-y-1">
                {related.map((a) => (
                  <ArticleMiniCard key={a.id} article={a} />
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </article>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  )
}
