/** A universe's activity feed: articles created, updated and published; members invited and joined. */

import { useMemo } from 'react'
import { History } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { ActivityFeed } from '@/components/mythos/ActivityFeed'
import { ListSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView } from '@/components/mythos/StatusViews'
import { useUniverseContext } from '@/features/universes/context'
import { combine, useActivity, useArticles, useUserNames } from '@/features/universes/hooks'

const PAGE_SIZE = 100

export default function UniverseActivityPage() {
  const { universe } = useUniverseContext()
  const { entries, status } = useActivity({ universeId: universe.id, limit: PAGE_SIZE })
  const { articles, status: articleStatus } = useArticles(universe.id)
  const names = useUserNames()
  const articleIds = useMemo(() => new Set(articles.map((a) => a.id)), [articles])
  const loadStatus = combine(status, articleStatus)

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header>
        <p className="mythos-eyebrow">{universe.name}</p>
        <h1 className="mt-1 text-4xl font-semibold text-foreground">Activity</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What members have written, published and who has been invited. Saves by one person within a few minutes count
          as one update.
        </p>
      </header>
      {loadStatus === 'loading' ? (
        <ListSkeleton rows={5} label="Loading activity…" />
      ) : loadStatus === 'error' ? (
        <ErrorView message="Activity could not be loaded. Refresh to try again." />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<History className="size-6" />}
          title="Nothing has happened yet"
          description="Articles that are created, updated or published, and members who are invited, appear here."
        />
      ) : (
        <>
          <ActivityFeed entries={entries} names={names} articleIds={articleIds} />
          {entries.length === PAGE_SIZE && (
            <p className="text-xs text-muted-foreground">Showing the latest {PAGE_SIZE} entries.</p>
          )}
        </>
      )}
    </div>
  )
}
