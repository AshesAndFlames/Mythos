/** Pieces of the public universe pages (ADR-024): the Explore card and the join / member banner. */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Globe2, UserPlus } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import type { UniverseRole } from '@/domain/mythos'
import type { PublicArticleSummary, PublicUniverseSummary } from '@/domain/public'
import { callAction } from '@/lib/actions'
import { relativeTime } from '@/lib/format'
import { CategoryBadge, RoleBadge, TagChip, TypeBadge } from './Badges'
import { CoverImage } from './CoverImage'

export function PublicUniverseCard({ universe }: { universe: PublicUniverseSummary }) {
  return (
    <Link
      to={`/p/${universe.id}`}
      data-testid="public-universe-card"
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
        {universe.myRole && <RoleBadge role={universe.myRole} className="absolute right-3 top-3 bg-background/70 backdrop-blur" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-5 pb-5 pt-1">
        <h3 className="text-2xl font-semibold leading-tight text-foreground">{universe.name}</h3>
        {universe.tagline && <p className="line-clamp-2 text-sm text-muted-foreground">{universe.tagline}</p>}
        <p className="mt-auto pt-3 text-xs text-muted-foreground">
          By {universe.ownerName} · {universe.articleCount} {universe.articleCount === 1 ? 'article' : 'articles'} · Updated{' '}
          {relativeTime(universe.updatedAt)}
        </p>
      </div>
    </Link>
  )
}

export function PublicArticleCard({
  article,
  universeId,
  categoryName,
}: {
  article: PublicArticleSummary
  universeId: string
  categoryName?: string
}) {
  return (
    <Link
      to={`/p/${universeId}/a/${article.id}`}
      data-testid="public-article-card"
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
        <TypeBadge type={article.type} className="self-start" />
        <h3 className="text-xl font-semibold leading-snug text-foreground">{article.title}</h3>
        {article.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{article.summary}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {categoryName && <CategoryBadge name={categoryName} />}
          {article.tags.slice(0, 3).map((t) => (
            <TagChip key={t} name={t} />
          ))}
        </div>
      </div>
    </Link>
  )
}

/**
 * The strip above a public universe: members get a link to the full view;
 * everyone else can join as a viewer (the server re-checks that the universe
 * is public and refuses someone with a pending invitation).
 */
export function PublicMembershipBar({
  universeId,
  universeName,
  myRole,
}: {
  universeId: string
  universeName: string
  myRole: UniverseRole | null
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function join() {
    setBusy(true)
    const res = await callAction<{ role: UniverseRole; joined: boolean }>('joinPublicUniverse', { universeId })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(res.data.joined ? `You joined ${universeName} as a viewer` : `You're already a member of ${universeName}`)
    navigate(`/u/${universeId}`, { state: { justJoined: true } })
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
      data-testid="public-membership-bar"
    >
      <p className="flex items-center gap-2 text-muted-foreground">
        <Globe2 className="size-4 shrink-0" aria-hidden />
        {myRole ? (
          <span>
            You're {myRole === 'owner' ? 'the owner' : `a ${myRole}`} here. This is the public view: published articles only.
          </span>
        ) : (
          <span>You're reading a public universe. Join as a viewer to follow it from your dashboard.</span>
        )}
      </p>
      {myRole ? (
        <Link to={`/u/${universeId}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
          Open the full view <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <Button size="sm" onClick={join} loading={busy} data-testid="join-universe">
          <UserPlus className="size-4" aria-hidden /> Join as viewer
        </Button>
      )}
    </div>
  )
}
