/**
 * A published article in a public universe, for any signed-in reader
 * (ADR-024). The body is the article's latest saved version, so readers see
 * what was published, not unsaved live edits.
 */

import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CategoryBadge, TagChip, TypeBadge } from '@/components/mythos/Badges'
import { CoverImage } from '@/components/mythos/CoverImage'
import { ArticleMediaStrip } from '@/components/mythos/Media'
import { PublicMembershipBar } from '@/components/mythos/PublicUniverse'
import { ConnectionsSection } from '@/components/mythos/Relationships'
import { RichTextSnapshotView } from '@/components/mythos/RichTextEditor'
import { ArticleSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, NotFoundView } from '@/components/mythos/StatusViews'
import { groupConnections } from '@/domain/relationships'
import { usePublicArticle } from '@/features/public/hooks'
import { longDate, relativeTime } from '@/lib/format'

export default function PublicArticlePage() {
  const { universeId = '', articleId = '' } = useParams()
  const { data, status, error, reload } = usePublicArticle(universeId, articleId)

  const groups = useMemo(() => {
    if (!data) return []
    const byId = new Map(data.related.map((a) => [a.id, a]))
    return groupConnections(
      articleId,
      data.connections.map((c) => ({ id: c.linkId, fromArticleId: c.fromArticleId, toArticleId: c.toArticleId, type: c.type, note: c.note })),
      byId,
    )
  }, [data, articleId])

  if (status === 'loading') return <ArticleSkeleton />
  if (status === 'error' || !data) {
    if (error === 'Universe not found') return <NotFoundView what="Universe" backTo="/explore" backLabel="Back to Explore" />
    if (error === 'Article not found') {
      return <NotFoundView what="Article" backTo={`/p/${universeId}`} backLabel="Back to the universe" />
    }
    return <ErrorView message={error ?? 'This article could not be loaded.'} onRetry={() => void reload()} />
  }

  const { universe, myRole, article } = data
  return (
    <article className="@container pb-16">
      <header className="relative">
        <div className="h-52 overflow-hidden sm:h-64">
          <CoverImage imageKey={article.coverImageKey} title={article.title} seed={article.id} monogramClassName="text-8xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-shell-panel via-shell-panel/50 to-transparent" />
      </header>

      <div className="relative mx-auto -mt-20 grid max-w-6xl gap-10 px-6 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link to="/explore" className="hover:text-foreground">
              Explore
            </Link>
            {' / '}
            <Link to={`/p/${universe.id}`} className="hover:text-foreground">
              {universe.name}
            </Link>
          </nav>
          <div className="mt-3">
            <TypeBadge type={article.type} />
          </div>
          <h1 className="mt-2 text-4xl font-semibold leading-tight text-foreground sm:text-5xl" data-testid="article-title">
            {article.title}
          </h1>
          {article.summary && (
            <p className="mt-4 max-w-3xl font-serif text-xl italic leading-relaxed text-muted-foreground" data-testid="article-summary">
              {article.summary}
            </p>
          )}
          <div className="mt-6">
            <PublicMembershipBar universeId={universe.id} universeName={universe.name} myRole={myRole} />
          </div>
          <div className="mythos-rule my-8" aria-hidden>
            ✦
          </div>
          <RichTextSnapshotView content={article.content} />
          {data.media.length > 0 && (
            <div className="mt-10">
              <ArticleMediaStrip items={data.media} />
            </div>
          )}
          <div className="mt-12">
            <ConnectionsSection
              groups={groups}
              universeId={universe.id}
              articleTitle={article.title}
              canEdit={false}
              basePath="/p"
              emptyText="Not connected to any other published article."
            />
          </div>
        </div>

        <aside className="space-y-8 @4xl:pt-24" aria-label="About this article">
          <section aria-label="Details" className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
            <Meta label="Category">
              {article.categoryName ? <CategoryBadge name={article.categoryName} /> : <span className="text-muted-foreground">None</span>}
            </Meta>
            <Meta label="Tags">
              {article.tags.length ? (
                <span className="flex flex-wrap gap-x-2" data-testid="article-tags">
                  {article.tags.map((t) => (
                    <TagChip key={t} name={t} />
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </Meta>
            <Meta label="Written by">{article.authorName}</Meta>
            <Meta label="Created">{longDate(article.createdAt)}</Meta>
            <Meta label="Updated">{relativeTime(article.updatedAt)}</Meta>
          </section>
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
