/**
 * Article editor. The body is live (collaborative Yjs); everything else is a
 * form saved by the `saveArticle` action, which also stores a version of the
 * body. "Save draft" and "Publish" differ only in the status they save.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, Trash2 } from 'lucide-react'
import { Button, Input, Label, Textarea, useToast } from '@/components/ui'
import { StatusBadge } from '@/components/mythos/Badges'
import { CoverPicker } from '@/components/mythos/CoverUpload'
import { ConfirmDialog } from '@/components/mythos/Dialogs'
import { RelationshipList, RelationshipPicker, useRelationships, type RelationshipItem } from '@/components/mythos/Relationships'
import { RichTextEditor, useArticleBody } from '@/components/mythos/RichTextEditor'
import { ArticleSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, FormError, NotFoundView, selectClass } from '@/components/mythos/StatusViews'
import { TagInput } from '@/components/mythos/TagInput'
import { ARTICLE_TYPE_LABELS, ARTICLE_TYPES, LIMITS, type ArticleStatus, type ArticleType } from '@/domain/mythos'
import { categoryOptions } from '@/features/universes/categories'
import { useUniverseContext } from '@/features/universes/context'
import { combine, useArticle, useCategories, useLinks, useTags, type ArticleView } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'
import { relativeTime } from '@/lib/format'
import { hasAtLeast } from '@/server/mythos/roles'

interface FormState {
  title: string
  type: ArticleType
  summary: string
  categoryId: string
  tags: string[]
  coverImageKey: string
}

function fromArticle(a: ArticleView, tags: string[]): FormState {
  return {
    title: a.title,
    type: a.type,
    summary: a.summary,
    categoryId: a.categoryId,
    tags,
    coverImageKey: a.coverImageKey,
  }
}

export default function EditArticlePage() {
  const { articleId = '' } = useParams()
  const { universe, role } = useUniverseContext()
  const { article, articles, status: articleStatus } = useArticle(universe.id, articleId)
  const { byArticle, status: tagStatus } = useTags(universe.id)
  const status = combine(articleStatus, tagStatus)

  if (!hasAtLeast(role, 'editor')) {
    return (
      <NotFoundView what="Editor" backTo={`/u/${universe.id}/a/${articleId}`} backLabel="Read the article instead" />
    )
  }
  if (status === 'loading') return <ArticleSkeleton />
  if (status === 'error') return <ErrorView message="This article could not be loaded. Refresh to try again." />
  if (!article) return <NotFoundView what="Article" backTo={`/u/${universe.id}/articles`} backLabel="Back to the library" />

  return <Editor key={article.id} article={article} articles={articles} initialTags={byArticle.get(article.id) ?? []} />
}

function Editor({ article, articles, initialTags }: { article: ArticleView; articles: ArticleView[]; initialTags: string[] }) {
  const { universe } = useUniverseContext()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => fromArticle(article, initialTags))
  const [saved, setSaved] = useState<FormState>(form)
  const [saving, setSaving] = useState<ArticleStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [unlinking, setUnlinking] = useState<RelationshipItem | null>(null)

  const body = useArticleBody(article.id, { editable: true })
  const { categories } = useCategories(universe.id)
  const { tags: allTags } = useTags(universe.id)
  const { links } = useLinks(universe.id)
  const relationships = useRelationships(article.id, links, articles)

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const options = useMemo(() => categoryOptions(categories), [categories])
  const categoryExists = !form.categoryId || categories.some((c) => c.id === form.categoryId)

  async function save(nextStatus: ArticleStatus) {
    const content = body.getJSON()
    if (!body.synced || !content) {
      setError('The article body is still connecting. Wait a moment and save again.')
      return
    }
    setSaving(nextStatus)
    setError(null)
    const res = await callAction<{ revision: { saved: boolean; number: number } }>('saveArticle', {
      articleId: article.id,
      ...form,
      categoryId: categoryExists ? form.categoryId : '',
      status: nextStatus,
      content,
    })
    setSaving(null)
    if (!res.ok) {
      setError(res.error)
      toast.error(res.error)
      return
    }
    setSaved(form)
    if (nextStatus === 'published') {
      toast.success(article.status === 'published' ? 'Published changes saved' : 'Article published')
      navigate(`/u/${universe.id}/a/${article.id}`)
    } else {
      toast.success(res.data.revision.saved ? `Draft saved · version ${res.data.revision.number}` : 'Draft saved')
    }
  }

  return (
    // Not a <form>: the relationship picker and link box inside are forms of their own.
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-6">
      <div className="sticky top-0 z-20 -mx-6 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-shell-panel/95 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/u/${universe.id}/a/${article.id}`} className="text-muted-foreground hover:text-foreground" aria-label="Back to the article">
            <ArrowLeft className="size-5" />
          </Link>
          <StatusBadge status={article.status} />
          <span className="truncate text-xs text-muted-foreground" aria-live="polite" data-testid="save-state">
            {dirty ? 'Unsaved details' : `Saved ${relativeTime(article.updatedAt)}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/u/${universe.id}/a/${article.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <Eye className="size-4" aria-hidden /> View
          </Link>
          <Button type="button" variant="outline" loading={saving === 'draft'} disabled={saving !== null} onClick={() => void save('draft')}>
            Save draft
          </Button>
          <Button type="button" loading={saving === 'published'} disabled={saving !== null} onClick={() => void save('published')}>
            Publish
          </Button>
        </div>
      </div>

      <FormError message={error} testId="save-error" />

      <div className="grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="article-title" className="sr-only">
              Title
            </Label>
            <input
              id="article-title"
              value={form.title}
              maxLength={LIMITS.articleTitle}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Untitled"
              required
              className="w-full bg-transparent font-display text-4xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/50 sm:text-5xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="article-summary">Summary</Label>
            <Textarea
              id="article-summary"
              data-testid="article-summary-input"
              value={form.summary}
              maxLength={LIMITS.articleSummary}
              onChange={(e) => set('summary', e.target.value)}
              rows={3}
              placeholder="One or two sentences readers see first."
              className="font-serif text-base italic"
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Body</p>
            {/* The save bar is ~61px tall once it fits on one line; narrower, it wraps, so the toolbar scrolls. */}
            <RichTextEditor body={body} toolbarClassName="@2xl:sticky @2xl:top-[61px]" />
          </div>
        </div>

        <aside className="space-y-6" aria-label="Article details">
          <div className="space-y-1.5">
            <Label htmlFor="article-type">Type</Label>
            <select id="article-type" className={`${selectClass} w-full`} value={form.type} onChange={(e) => set('type', e.target.value as ArticleType)}>
              {ARTICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ARTICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <CategoryField
            universeId={universe.id}
            value={categoryExists ? form.categoryId : ''}
            options={options}
            onChange={(id) => set('categoryId', id)}
          />

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Tags</p>
            <TagInput value={form.tags} onChange={(t) => set('tags', t)} suggestions={allTags.map((t) => t.name)} />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Cover</p>
            <CoverPicker
              value={form.coverImageKey}
              title={form.title}
              seed={article.id}
              aspect="aspect-[16/9]"
              onChange={(key) => set('coverImageKey', key)}
              onError={(m) => toast.error(m)}
            />
            <p className="text-xs text-muted-foreground">Saved with the article. Anyone who has an image's direct link can view it.</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Relationships</p>
            <p className="text-xs text-muted-foreground">Relationships are saved immediately.</p>
            <RelationshipList
              items={relationships}
              universeId={universe.id}
              title="Linked articles"
              emptyText="No relationships yet."
              onRemove={setUnlinking}
            />
            <RelationshipPicker articleId={article.id} articles={articles} />
          </div>

          <div className="border-t border-border pt-6">
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete article
            </Button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${article.title}”?`}
        description="The article, its body, saved versions, tags and relationships are erased for everyone. This cannot be undone."
        confirmText="Delete article"
        onConfirm={async () => {
          const res = await callAction('deleteArticle', { articleId: article.id })
          if (!res.ok) return res.error
          toast.success('Article deleted')
          navigate(`/u/${universe.id}/articles`, { replace: true })
          return null
        }}
      />
      <ConfirmDialog
        open={unlinking !== null}
        onClose={() => setUnlinking(null)}
        title="Remove this relationship?"
        description={unlinking ? `“${article.title}” will no longer be ${unlinking.label} “${unlinking.other.title}”.` : ''}
        confirmText="Remove"
        onConfirm={async () => {
          if (!unlinking) return null
          const res = await callAction('deleteLink', { linkId: unlinking.link.id })
          if (!res.ok) return res.error
          toast.success('Relationship removed')
          return null
        }}
      />
    </div>
  )
}

function CategoryField({
  universeId,
  value,
  options,
  onChange,
}: {
  universeId: string
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    const res = await callAction<{ categoryId: string }>('createCategory', { universeId, name, parentId: '' })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onChange(res.data.categoryId)
    setName('')
    setAdding(false)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="article-category">Category</Label>
      <select id="article-category" className={`${selectClass} w-full`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No category</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {adding ? (
        <div className="flex gap-2">
          <Input
            aria-label="New category name"
            value={name}
            maxLength={LIMITS.categoryName}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (name.trim()) void create()
              }
            }}
            className="h-9"
            autoFocus
          />
          <Button type="button" size="sm" loading={busy} disabled={!name.trim()} onClick={() => void create()}>
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-xs text-primary hover:underline">
          + New category
        </button>
      )}
      <FormError message={error} />
    </div>
  )
}
