/**
 * Universe shell: resolves the universe and the caller's role once, then
 * renders a universe navigation rail (desktop) / tab strip (mobile) beside
 * the page. Pages read both through `useUniverseContext()`.
 */

import { useMemo, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { BookOpenText, Feather, LayoutDashboard, Settings2 } from 'lucide-react'
import { CoverImage } from '@/components/mythos/CoverImage'
import { NewArticleDialog } from '@/components/mythos/Dialogs'
import { PageSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, NotFoundView } from '@/components/mythos/StatusViews'
import { RoleBadge } from '@/components/mythos/Badges'
import type { UniverseContext } from '@/features/universes/context'
import { useArticles, useCategories, useUniverse } from '@/features/universes/hooks'
import { hasAtLeast } from '@/server/mythos/roles'
import { cn } from '@/lib/utils'

export default function UniverseLayout() {
  const { universeId = '' } = useParams()
  const { universe, role, status } = useUniverse(universeId)
  const [creating, setCreating] = useState(false)
  const context = useMemo<UniverseContext | null>(
    () => (universe && role ? { universe, role, newArticle: () => setCreating(true) } : null),
    [universe, role],
  )

  if (status === 'loading') return <PageSkeleton label="Opening the universe…" />
  if (status === 'error') return <ErrorView message="This universe could not be loaded. Refresh to try again." />
  if (!context) return <NotFoundView what="Universe" />

  const canEdit = hasAtLeast(context.role, 'editor')
  return (
    // Layout follows the panel's width (the assistant dock narrows it), not
    // the viewport's. A container query can't style its own container, hence
    // the wrapper.
    <div className="@container/universe min-h-full">
      <div className="flex min-h-full flex-col @3xl/universe:flex-row">
        <UniverseRail context={context} canEdit={canEdit} />
        <div className="@container min-w-0 flex-1">
          <Outlet context={context} />
        </div>
      </div>
      {canEdit && <NewArticleDialog open={creating} onClose={() => setCreating(false)} universeId={universeId} />}
    </div>
  )
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  )

function UniverseRail({ context, canEdit }: { context: UniverseContext; canEdit: boolean }) {
  const { universe, role, newArticle } = context
  const base = `/u/${universe.id}`
  const { categories } = useCategories(universe.id)
  const { articles } = useArticles(universe.id)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of articles) if (a.categoryId) m.set(a.categoryId, (m.get(a.categoryId) ?? 0) + 1)
    return m
  }, [articles])
  const topCategories = categories.filter((c) => !c.parentId)

  return (
    <aside
      aria-label={`${universe.name} navigation`}
      className="border-b border-border @3xl/universe:sticky @3xl/universe:top-0 @3xl/universe:h-[calc(100vh-1rem)] @3xl/universe:w-60 @3xl/universe:shrink-0 @3xl/universe:overflow-y-auto @3xl/universe:border-b-0 @3xl/universe:border-r"
    >
      <div className="hidden @3xl/universe:block">
        <div className="relative h-24 overflow-hidden">
          <CoverImage imageKey={universe.coverImageKey} title={universe.name} seed={universe.id} monogramClassName="text-3xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-shell-panel to-transparent" />
        </div>
        <div className="-mt-6 px-4">
          <p className="truncate font-display text-xl font-semibold text-foreground" title={universe.name}>
            {universe.name}
          </p>
          <RoleBadge role={role} className="mt-1" />
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 py-2 @3xl/universe:mt-4 @3xl/universe:flex-col @3xl/universe:overflow-visible">
        <NavLink end to={base} className={linkClass}>
          <LayoutDashboard className="size-4" aria-hidden />
          Overview
        </NavLink>
        <NavLink to={`${base}/articles`} className={linkClass}>
          <BookOpenText className="size-4" aria-hidden />
          Library
        </NavLink>
        <NavLink to={`${base}/settings`} className={linkClass}>
          <Settings2 className="size-4" aria-hidden />
          {role === 'owner' ? 'Settings' : 'Members'}
        </NavLink>
        {canEdit && (
          <button
            type="button"
            onClick={newArticle}
            data-testid="new-article-button"
            className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10 @3xl/universe:mt-2 @3xl/universe:border @3xl/universe:border-primary/30"
          >
            <Feather className="size-4" aria-hidden />
            New article
          </button>
        )}
      </nav>

      {topCategories.length > 0 && (
        <div className="hidden px-3 pb-6 @3xl/universe:block">
          <p className="mythos-eyebrow px-3 pb-2 pt-4">Categories</p>
          <ul className="space-y-0.5">
            {topCategories.map((c) => (
              <li key={c.id}>
                <NavLink
                  to={`${base}/articles?category=${encodeURIComponent(c.id)}`}
                  className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs tabular-nums opacity-70">{counts.get(c.id) ?? 0}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
