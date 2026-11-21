/** Article library: grid/list, search, type and category filters, sorting, categories. */

import { useMemo, useState, type FormEvent } from 'react'
import { FolderPlus, LayoutGrid, List as ListIcon, SearchX, Trash2, BookOpenText } from 'lucide-react'
import { Button, EmptyState, Input, SearchInput, useToast } from '@/components/ui'
import { ArticleCard, ArticleRow } from '@/components/mythos/Cards'
import { ConfirmDialog } from '@/components/mythos/Dialogs'
import { CardGridSkeleton, ListSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, FormError, selectClass } from '@/components/mythos/StatusViews'
import { ARTICLE_TYPE_LABELS, ARTICLE_TYPES, LIMITS, type ArticleType } from '@/domain/mythos'
import { useUniverseContext } from '@/features/universes/context'
import { categoryOptions } from '@/features/universes/categories'
import { SORTS, useLibraryFilters, type SortKey } from '@/features/universes/filters'
import { combine, useArticles, useCategories, useTags, type CategoryView } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'
import { hasAtLeast } from '@/server/mythos/roles'
import { cn } from '@/lib/utils'

const VIEW_KEY = 'mythos-library-view'

function readView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export default function LibraryPage() {
  const { universe, role, newArticle } = useUniverseContext()
  const canEdit = hasAtLeast(role, 'editor')
  const [view, setViewState] = useState<'grid' | 'list'>(readView)
  const { filters, update, reset } = useLibraryFilters()
  const { q, type, category, sort } = filters

  const { articles, status: articleStatus } = useArticles(universe.id)
  const { categories, status: categoryStatus } = useCategories(universe.id)
  const { byArticle, status: tagStatus } = useTags(universe.id)
  const status = combine(articleStatus, categoryStatus, tagStatus)
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  function setView(v: 'grid' | 'list') {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private mode: the choice lasts for this visit only */
    }
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    // A category filter includes its sub-categories.
    const inCategory = new Set<string>()
    if (category) {
      const stack = [category]
      while (stack.length) {
        const id = stack.pop() as string
        inCategory.add(id)
        for (const c of categories) if (c.parentId === id && !inCategory.has(c.id)) stack.push(c.id)
      }
    }
    const list = articles.filter((a) => {
      if (type && a.type !== type) return false
      if (category && !inCategory.has(a.categoryId)) return false
      if (!needle) return true
      return (
        a.title.toLowerCase().includes(needle) ||
        a.summary.toLowerCase().includes(needle) ||
        (byArticle.get(a.id) ?? []).some((t) => t.toLowerCase().includes(needle))
      )
    })
    return [...list].sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'created'
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    )
  }, [articles, categories, byArticle, q, type, category, sort])

  const filtered = Boolean(q || type || category)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mythos-eyebrow">{universe.name}</p>
          <h1 className="mt-1 text-4xl font-semibold text-foreground">The Library</h1>
        </div>
        {canEdit && <Button onClick={newArticle}>New article</Button>}
      </header>

      <div className="mt-6 grid gap-8 @4xl:grid-cols-[1fr_15rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2" role="search">
            <div className="min-w-56 flex-1">
              <SearchInput
                value={q}
                onChange={(e) => update({ q: e.target.value })}
                onClear={() => update({ q: '' })}
                placeholder="Search titles, summaries and tags"
                aria-label="Search articles"
              />
            </div>
            <select aria-label="Filter by type" className={selectClass} value={type} onChange={(e) => update({ type: e.target.value as ArticleType | '' })}>
              <option value="">All types</option>
              {ARTICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ARTICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by category"
              className={selectClass}
              value={categoryName.has(category) ? category : ''}
              onChange={(e) => update({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {categoryOptions(categories).map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select aria-label="Sort articles" className={selectClass} value={sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
              {Object.entries(SORTS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <div role="group" aria-label="Layout" className="flex rounded-lg border border-border p-0.5">
              <ViewButton label="Grid view" active={view === 'grid'} onClick={() => setView('grid')}>
                <LayoutGrid className="size-4" />
              </ViewButton>
              <ViewButton label="List view" active={view === 'list'} onClick={() => setView('list')}>
                <ListIcon className="size-4" />
              </ViewButton>
            </div>
          </div>

          <p className="mt-3 text-sm text-muted-foreground" aria-live="polite" data-testid="library-count">
            {status === 'ready' && `${visible.length} of ${articles.length} articles`}
          </p>

          <div className="mt-4">
            {status === 'loading' ? (
              view === 'grid' ? <CardGridSkeleton label="Loading the library…" /> : <ListSkeleton label="Loading the library…" />
            ) : status === 'error' ? (
              <ErrorView message="The library could not be loaded. Refresh to try again." />
            ) : articles.length === 0 ? (
              <EmptyState
                icon={<BookOpenText className="size-6" />}
                title="No articles yet"
                description={canEdit ? 'Write the first entry of this universe.' : 'The editors have not written anything yet.'}
                action={canEdit ? { label: 'New article', onClick: newArticle } : undefined}
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={<SearchX className="size-6" />}
                title="Nothing matches"
                description="Try a different search or clear the filters."
                action={
                  filtered
                    ? {
                        label: 'Clear filters',
                        onClick: reset,
                      }
                    : undefined
                }
              />
            ) : view === 'grid' ? (
              <div className="grid gap-5 @xl:grid-cols-2 @5xl:grid-cols-3">
                {visible.map((a) => (
                  <ArticleCard key={a.id} article={a} universeId={universe.id} categoryName={categoryName.get(a.categoryId)} tags={byArticle.get(a.id)} />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {visible.map((a) => (
                  <ArticleRow key={a.id} article={a} universeId={universe.id} categoryName={categoryName.get(a.categoryId)} tags={byArticle.get(a.id)} />
                ))}
              </div>
            )}
          </div>
        </div>

        <CategoryPanel universeId={universe.id} categories={categories} canEdit={canEdit} selected={category} onSelect={(id) => update({ category: id })} />
      </div>
    </div>
  )
}

function ViewButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn('rounded-md p-1.5 text-muted-foreground hover:text-foreground', active && 'bg-accent text-foreground')}
    >
      {children}
    </button>
  )
}

function CategoryPanel({
  universeId,
  categories,
  canEdit,
  selected,
  onSelect,
}: {
  universeId: string
  categories: CategoryView[]
  canEdit: boolean
  selected: string
  onSelect: (id: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CategoryView | null>(null)
  const options = categoryOptions(categories)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction('createCategory', { universeId, name, parentId })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    toast.success(`Category “${name.trim()}” created`)
    setName('')
  }

  return (
    <aside aria-labelledby="categories-heading" className="space-y-3">
      <h2 id="categories-heading" className="mythos-eyebrow">
        Categories
      </h2>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="space-y-0.5" data-testid="category-list">
          {options.map(({ id, label, depth }) => {
            const cat = categories.find((c) => c.id === id) as CategoryView
            return (
              <li key={id} className="group flex items-center gap-1" style={{ paddingLeft: `${depth * 0.75}rem` }}>
                <button
                  type="button"
                  onClick={() => onSelect(selected === id ? '' : id)}
                  aria-pressed={selected === id}
                  className={cn(
                    'flex-1 truncate rounded-md px-2 py-1 text-left text-sm',
                    selected === id ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {label.trim()}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Delete category ${cat.name}`}
                    onClick={() => setDeleting(cat)}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="New category">
          <Input
            aria-label="Category name"
            value={name}
            maxLength={LIMITS.categoryName}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category"
            className="h-9"
          />
          {options.length > 0 && (
            <select aria-label="Parent category" className={`${selectClass} h-9 w-full`} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Top level</option>
              {options.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" size="sm" variant="outline" className="w-full" loading={busy} disabled={!name.trim()}>
            <FolderPlus className="size-4" aria-hidden /> Add category
          </Button>
          <FormError message={error} />
        </form>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="Its articles stay in the library without a category, and its sub-categories move up a level."
        onConfirm={async () => {
          if (!deleting) return null
          const res = await callAction('deleteCategory', { categoryId: deleting.id })
          if (!res.ok) return res.error
          if (selected === deleting.id) onSelect('')
          toast.success('Category deleted')
          return null
        }}
      />
    </aside>
  )
}
