/** User dashboard: welcome, invitations, universes, recent activity, recently edited articles. */

import { useMemo, useState } from 'react'
import { Feather, Globe2, History, Plus } from 'lucide-react'
import { useUser } from 'deepspace'
import { Button, EmptyState } from '@/components/ui'
import { ArticleMiniCard, UniverseCard } from '@/components/mythos/Cards'
import { CreateUniverseDialog } from '@/components/mythos/Dialogs'
import { CardGridSkeleton, ListSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView } from '@/components/mythos/StatusViews'
import { useActivity, useMyUniverses, useRecentArticles, useUserNames } from '@/features/universes/hooks'
import { greeting } from '@/lib/format'
import { ActivityFeed } from '@/components/mythos/ActivityFeed'
import { InvitationsPanel } from '@/components/mythos/Invitations'

export default function DashboardPage() {
  const { user } = useUser()
  const { universes, status } = useMyUniverses()
  // Every article the caller can read: counts per universe and the recent strip.
  const { articles, status: articleStatus } = useRecentArticles()
  const { entries: activity, status: activityStatus } = useActivity({ limit: 12 })
  const names = useUserNames()
  const [creating, setCreating] = useState(false)

  const universeName = useMemo(() => new Map(universes.map((u) => [u.id, u.name])), [universes])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of articles) m.set(a.universeId, (m.get(a.universeId) ?? 0) + 1)
    return m
  }, [articles])

  const articleIds = useMemo(() => new Set(articles.map((a) => a.id)), [articles])

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

        <InvitationsPanel />

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
              {activityStatus === 'loading' || articleStatus === 'loading' ? (
                <ListSkeleton rows={3} label="Loading activity…" />
              ) : activityStatus === 'error' ? (
                <p role="alert" className="text-sm text-destructive">
                  Activity could not be loaded.
                </p>
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
              ) : (
                <ActivityFeed entries={activity} names={names} articleIds={articleIds} universeNames={universeName} />
              )}
            </section>
          </div>
        </div>
      </div>
      <CreateUniverseDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
