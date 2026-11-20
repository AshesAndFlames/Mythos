/**
 * Article page.
 *
 * Phase 1 surface: title, type, summary, and a live co-edited plain-text body.
 * The body is a record-bound Yjs field: the RecordRoom applies an update only
 * when the caller passes the article's `update` rule, and reports that as
 * `canWrite` — so the editor's read-only state is the server's decision, not
 * a client-side role guess. (Phase 2 swaps the textarea for Tiptap.)
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutations, useYjsText } from 'deepspace'
import { Badge, Button, Input, Label, Textarea } from '@/components/ui'
import { ErrorView, FormError, LoadingView, NotFoundView } from '@/components/mythos/StatusViews'
import { ARTICLE_TYPE_LABELS, COLLECTIONS, LIMITS } from '@/domain/mythos'
import type { ArticleData } from '@/domain/records'
import { useArticle, useUniverse } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'
import { hasAtLeast } from '@/server/mythos/roles'

export default function ArticlePage() {
  const { universeId = '', articleId = '' } = useParams()
  const { universe, role, status: universeStatus } = useUniverse(universeId)
  const { article, status } = useArticle(universeId, articleId)

  if (status === 'loading' || universeStatus === 'loading') return <LoadingView />
  if (status === 'error' || universeStatus === 'error') {
    return <ErrorView message="This article could not be loaded. Refresh to try again." />
  }
  if (!universe || !role || !article) return <NotFoundView what="Article" />

  const canEdit = hasAtLeast(role, 'editor')

  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <Link to={`/u/${universeId}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {universe.name}
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <Badge variant="secondary">{ARTICLE_TYPE_LABELS[article.type]}</Badge>
        {!canEdit && <Badge variant="outline">Read only</Badge>}
      </div>

      <TitleEditor articleId={article.id} title={article.title} canEdit={canEdit} />
      <SummaryEditor articleId={article.id} summary={article.summary} canEdit={canEdit} />
      <BodyEditor articleId={article.id} />

      {canEdit && <DeleteArticle universeId={universeId} articleId={article.id} title={article.title} />}
    </article>
  )
}

function TitleEditor({ articleId, title, canEdit }: { articleId: string; title: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])

  async function save() {
    if (draft.trim() === title) return setEditing(false)
    setBusy(true)
    setError(null)
    const res = await callAction('renameArticle', { articleId, title: draft })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-semibold text-foreground" data-testid="article-title">
          {title}
        </h1>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Rename
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      <Label htmlFor="article-title-input" className="sr-only">
        Title
      </Label>
      <div className="flex gap-2">
        <Input
          id="article-title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={LIMITS.articleTitle}
          autoFocus
        />
        <Button onClick={save} disabled={busy || !draft.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
      <FormError message={error} />
    </div>
  )
}

function SummaryEditor({ articleId, summary, canEdit }: { articleId: string; summary: string; canEdit: boolean }) {
  const { ready, putConfirmed } = useMutations<ArticleData>(COLLECTIONS.articles)
  const [draft, setDraft] = useState(summary)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = draft !== summary

  useEffect(() => {
    if (!saving) setDraft(summary)
    // Adopt remote changes to the summary unless a local save is in flight.
  }, [summary])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await putConfirmed(articleId, { summary: draft.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The summary could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return summary ? (
      <p className="mt-4 text-lg text-muted-foreground" data-testid="article-summary">
        {summary}
      </p>
    ) : null
  }

  return (
    <div className="mt-6 space-y-2">
      <Label htmlFor="article-summary">Summary</Label>
      <Textarea
        id="article-summary"
        data-testid="article-summary-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={LIMITS.articleSummary}
        rows={3}
        placeholder="One or two sentences that introduce this entry."
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={!ready || saving || !dirty}>
          {saving ? 'Saving…' : 'Save summary'}
        </Button>
        <FormError message={error} testId="summary-error" />
      </div>
    </div>
  )
}

function BodyEditor({ articleId }: { articleId: string }) {
  const { text, setText, synced, canWrite } = useYjsText(COLLECTIONS.articles, articleId, 'body')

  return (
    <div className="mt-8 space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="article-body">Article</Label>
        <span className="text-xs text-muted-foreground" data-testid="body-sync-state">
          {!synced ? 'Connecting…' : canWrite ? 'Live — changes save automatically' : 'Read only'}
        </span>
      </div>
      <Textarea
        id="article-body"
        data-testid="article-body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canWrite}
        disabled={!synced}
        rows={16}
        placeholder={canWrite ? 'Write the story of this entry…' : 'Nothing written yet.'}
        className="font-serif text-base leading-relaxed"
      />
    </div>
  )
}

function DeleteArticle({ universeId, articleId, title }: { universeId: string; articleId: string; title: string }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    const res = await callAction('deleteArticle', { articleId })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    navigate(`/u/${universeId}`)
  }

  return (
    <div className="mt-12 border-t border-border pt-6">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground">Delete “{title}” and its links? This cannot be undone.</span>
          <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete article'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
          Delete article
        </Button>
      )}
      <FormError message={error} />
    </div>
  )
}
