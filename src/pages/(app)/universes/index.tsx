/** User dashboard: welcome, universes, recent activity, recently edited articles. */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Feather, Globe2, History, Plus } from 'lucide-react'
import { useUser } from 'deepspace'
import { Button, EmptyState } from '@/components/ui'
import { ArticleMiniCard, UniverseCard } from '@/components/mythos/Cards'
import { CreateUniverseDialog } from '@/components/mythos/Dialogs'
import { CardGridSkeleton, ListSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView } from '@/components/mythos/StatusViews'
import { useMyUniverses, useRecentArticles, useRecentRevisions, useUserNames } from '@/features/universes/hooks'
import { greeting, relativeTime } from '@/lib/format'

interface ActivityItem {
  id: string
  at: string
  who: string
  verb: string
  title: string
  href: string
  universeName: string
}

export default function DashboardPage() {
  const { user } = useUser()
  const { universes, status } = useMyUniverses()
  // Every article the caller can read: counts per universe and the recent strip.
  const { articles, status: articleStatus } = useRecentArticles()
  const { revisions, status: revisionStatus } = useRecentRevisions(15)
  const names = useUserNames()
  const [creating, setCreating] = useState(false)

  const universeName = useMemo(() => new Map(universes.map((u) => [u.id, u.name])), [universes])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of articles) m.set(a.universeId, (m.get(a.universeId) ?? 0) + 1)
    return m
  }, [articles])

  const activity = useMemo<ActivityItem[]>(() => {
    const titleOf = new Map(articles.map((a) => [a.id, a.title]))
    const items: ActivityItem[] = revisions
      .filter((r) => universeName.has(r.universeId) && titleOf.has(r.articleId))
      .map((r) => ({
        id: `rev-${r.id}`,
        at: r.createdAt,
        who: names.get(r.authorId) ?? 'Someone',
        verb: r.note === 'Published' ? 'published' : 'saved a version of',
        title: titleOf.get(r.articleId) as string,
        href: `/u/${r.universeId}/a/${r.articleId}`,
        universeName: universeName.get(r.universeId) as string,
      }))
    for (const a of articles) {
      if (!universeName.has(a.universeId)) continue
      items.push({
        id: `new-${a.id}`,
        at: a.createdAt,
        who: names.get(a.authorId) ?? 'Someone',
        verb: 'started',
        title: a.title,
        href: `/u/${a.universeId}/a/${a.id}`,
        universeName: universeName.get(a.universeId) as string,
      })
    }
    return items.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 10)
  }, [revisions, articles, names, universeName])

  const firstName = (user?.name ?? '').split(' ')[0]

  return (
    <div className="mythos-atmosphere @container min-h-full">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mythos-eyebrow">The Archive</p>
            <h1 className="mt-2 text-4xl font-semibold text-foreground sm:text-5xl">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-2 max-w-xl font-serif text-lg italic text-muted-foreground">
              {universes.length > 0 ? 'Your worlds are where you left them.' : 'Every chronicle begins with a single world.'}
            </p>
          </div>
          {universes.length > 0 && (
            <Button onClick={() => setCreating(true)} data-testid="new-universe-button">
              <Plus className="size-4" aria-hidden /> New universe
            </Button>
          )}
        </header>

        <div className="mythos-rule my-10" aria-hidden>
          ✦
        </div>

        <div className="grid gap-12 @5xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-labelledby="universes-heading">
            <h2 id="universes-heading" className="mb-5 text-2xl font-semibold text-foreground">
              Your universes
            </h2>
            {status === 'loading' ? (
              <CardGridSkeleton count={4} label="Loading your universes…" />
            ) : status === 'error' ? (
              <ErrorView message="Your universes could not be loaded. Refresh to try again." />
            ) : universes.length === 0 ? (
              <EmptyState
                icon={<Globe2 className="size-6" />}
                title="No universes yet"
                description="Found a world of your own, or ask a friend to invite you to theirs."
                action={{ label: 'Create a universe', onClick: () => setCreating(true) }}
              />
            ) : (
              <div className="grid gap-5 @xl:grid-cols-2 @6xl:grid-cols-3" data-testid="universe-grid">
                {universes.map((u) => (
                  <UniverseCard key={u.id} universe={u} articleCount={articleStatus === 'ready' ? counts.get(u.id) ?? 0 : undefined} />
                ))}
              </div>
            )}
          </section>

          <div className="space-y-10">
            <section aria-labelledby="recent-articles-heading">
              <h2 id="recent-articles-heading" className="mythos-eyebrow mb-3 flex items-center gap-2">
                <Feather className="size-3.5" aria-hidden /> Recently edited
              </h2>
              {articleStatus === 'loading' ? (
                <ListSkeleton rows={3} label="Loading recent articles…" />
              ) : articleStatus === 'error' ? (
                <p role="alert" className="text-sm text-destructive">
                  Recent articles could not be loaded.
                </p>
              ) : articles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Articles you and your collaborators edit appear here.</p>
              ) : (
                <div className="space-y-1">
                  {articles.slice(0, 6).map((a) => (
                    <ArticleMiniCard key={a.id} article={a} universeName={universeName.get(a.universeId)} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="activity-heading">
              <h2 id="activity-heading" className="mythos-eyebrow mb-3 flex items-center gap-2">
                <History className="size-3.5" aria-hidden /> Recent activity
              </h2>
              {revisionStatus === 'loading' || articleStatus === 'loading' ? (
                <ListSkeleton rows={3} label="Loading activity…" />
              ) : revisionStatus === 'error' ? (
                <p role="alert" className="text-sm text-destructive">
                  Activity could not be loaded.
                </p>
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-4" data-testid="activity-feed">
                  {activity.map((item) => (
                    <li key={item.id} className="text-sm">
                      <span className="absolute -left-[3px] mt-1.5 size-1.5 rounded-full bg-primary/70" aria-hidden />
                      <p className="text-foreground">
                        <span className="font-medium">{item.who}</span> {item.verb}{' '}
                        <Link to={item.href} className="font-display text-base font-semibold text-primary hover:underline">
                          {item.title}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.universeName} · {relativeTime(item.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </div>
      <CreateUniverseDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
