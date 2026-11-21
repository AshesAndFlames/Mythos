/** Universe and article cards (grid) and article rows (list). */

import { Link } from 'react-router-dom'
import type { ArticleView, UniverseView } from '@/features/universes/hooks'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CategoryBadge, RoleBadge, StatusBadge, TagChip, TypeBadge } from './Badges'
import { CoverImage } from './CoverImage'

export function UniverseCard({ universe, articleCount }: { universe: UniverseView; articleCount?: number }) {
  return (
    <Link
      to={`/u/${universe.id}`}
      data-testid="universe-card"
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-card-hover)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <CoverImage
          imageKey={universe.coverImageKey}
          title={universe.name}
          seed={universe.id}
          className="transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card to-transparent" />
        <RoleBadge role={universe.role} className="absolute right-3 top-3 bg-background/70 backdrop-blur" />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-5 pb-5 pt-1">
        <h3 className="text-2xl font-semibold leading-tight text-foreground">{universe.name}</h3>
        {universe.tagline && <p className="line-clamp-2 text-sm text-muted-foreground">{universe.tagline}</p>}
        <p className="mt-auto pt-3 text-xs text-muted-foreground">
          {articleCount !== undefined && <>{articleCount} {articleCount === 1 ? 'entry' : 'entries'} · </>}
          Updated {relativeTime(universe.updatedAt)}
        </p>
      </div>
    </Link>
  )
}

interface ArticleCardProps {
  article: ArticleView
  universeId: string
  categoryName?: string
  tags?: string[]
  showStatus?: boolean
}

export function ArticleCard({ article, universeId, categoryName, tags, showStatus = true }: ArticleCardProps) {
  return (
    <Link
      to={`/u/${universeId}/a/${article.id}`}
      data-testid="article-card"
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-card-hover)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="aspect-[3/2] overflow-hidden">
        <CoverImage
          imageKey={article.coverImageKey}
          title={article.title}
          seed={article.id}
          className="transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
          monogramClassName="text-4xl"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={article.type} />
          {showStatus && article.status === 'draft' && <StatusBadge status="draft" />}
        </div>
        <h3 className="text-xl font-semibold leading-snug text-foreground">{article.title}</h3>
        {article.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{article.summary}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {categoryName && <CategoryBadge name={categoryName} />}
          {tags?.slice(0, 3).map((t) => <TagChip key={t} name={t} />)}
        </div>
      </div>
    </Link>
  )
}

export function ArticleRow({ article, universeId, categoryName, tags, showStatus = true }: ArticleCardProps) {
  return (
    <Link
      to={`/u/${universeId}/a/${article.id}`}
      data-testid="article-row"
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/40"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-md">
        <CoverImage imageKey={article.coverImageKey} title={article.title} seed={article.id} monogramClassName="text-xl" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-display text-lg font-semibold text-foreground">{article.title}</span>
          {showStatus && article.status === 'draft' && <StatusBadge status="draft" />}
        </div>
        <p className="truncate text-sm text-muted-foreground">{article.summary || 'No summary yet.'}</p>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        <TypeBadge type={article.type} />
        <span className="text-xs text-muted-foreground">
          {categoryName ? `${categoryName} · ` : ''}
          {relativeTime(article.updatedAt)}
        </span>
      </div>
      {tags && tags.length > 0 && <span className="sr-only">Tags: {tags.join(', ')}</span>}
    </Link>
  )
}

/** A compact card used in "recent articles" strips. */
export function ArticleMiniCard({ article, universeName, className }: { article: ArticleView; universeName?: string; className?: string }) {
  return (
    <Link
      to={`/u/${article.universeId}/a/${article.id}`}
      className={cn('flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/40', className)}
    >
      <div className="size-10 shrink-0 overflow-hidden rounded-md">
        <CoverImage imageKey={article.coverImageKey} title={article.title} seed={article.id} monogramClassName="text-lg" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{article.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {universeName ? `${universeName} · ` : ''}
          {relativeTime(article.updatedAt)}
        </p>
      </div>
    </Link>
  )
}
