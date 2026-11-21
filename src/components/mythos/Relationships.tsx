/**
 * Relationships between articles: the outgoing/incoming list (read view and
 * editor) and the picker that creates one. Both talk to validated actions.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { LIMITS, LINK_LABELS, LINK_TYPES, type LinkType } from '@/domain/mythos'
import type { ArticleView, LinkView } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'
import { FormError, selectClass } from './StatusViews'
import { TypeBadge } from './Badges'

export interface RelationshipItem {
  link: LinkView
  other: ArticleView
  direction: 'outgoing' | 'incoming'
  label: string
}

/** Resolves an article's links into display rows. Links to unreadable articles are skipped. */
export function useRelationships(articleId: string, links: LinkView[], articles: ArticleView[]): RelationshipItem[] {
  return useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]))
    const items: RelationshipItem[] = []
    for (const link of links) {
      if (link.fromArticleId === articleId) {
        const other = byId.get(link.toArticleId)
        if (other) items.push({ link, other, direction: 'outgoing', label: LINK_LABELS[link.type].forward })
      } else if (link.toArticleId === articleId) {
        const other = byId.get(link.fromArticleId)
        if (other) items.push({ link, other, direction: 'incoming', label: LINK_LABELS[link.type].inverse })
      }
    }
    return items.sort((a, b) => a.label.localeCompare(b.label) || a.other.title.localeCompare(b.other.title))
  }, [articleId, links, articles])
}

export function RelationshipList({
  items,
  universeId,
  title,
  onRemove,
  emptyText,
}: {
  items: RelationshipItem[]
  universeId: string
  title: string
  /** When given, each row gets a remove button. */
  onRemove?: (item: RelationshipItem) => void
  emptyText: string
}) {
  return (
    <section aria-label={title}>
      <h3 className="mythos-eyebrow mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5" data-testid={`relationships-${title.toLowerCase().replace(/\W+/g, '-')}`}>
          {items.map((item) => (
            <li key={item.link.id} className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              {item.direction === 'outgoing' ? (
                <ArrowRight className="size-3.5 shrink-0 text-primary/70" aria-label="Outgoing" />
              ) : (
                <ArrowLeft className="size-3.5 shrink-0 text-primary/70" aria-label="Incoming" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs italic text-muted-foreground">{item.label}</p>
                <Link to={`/u/${universeId}/a/${item.other.id}`} className="block truncate font-medium text-foreground hover:text-primary">
                  {item.other.title}
                </Link>
                {item.link.note && <p className="truncate text-xs text-muted-foreground">{item.link.note}</p>}
              </div>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  aria-label={`Remove relationship with ${item.other.title}`}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Adds a relationship from `articleId` to another article of the universe. */
export function RelationshipPicker({ articleId, articles }: { articleId: string; articles: ArticleView[] }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [targetId, setTargetId] = useState('')
  const [type, setType] = useState<LinkType>('related_to')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return articles
      .filter((a) => a.id !== articleId && (!needle || a.title.toLowerCase().includes(needle)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 8)
  }, [articles, articleId, query])
  const target = articles.find((a) => a.id === targetId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!targetId) return
    setBusy(true)
    setError(null)
    const res = await callAction('createLink', { fromArticleId: articleId, toArticleId: targetId, type, note })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    toast.success(`Linked to ${target?.title ?? 'article'}`)
    setTargetId('')
    setQuery('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Add a relationship">
      <p className="text-sm font-medium text-foreground">Add a relationship</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Relationship type" className={`${selectClass} h-9`} value={type} onChange={(e) => setType(e.target.value as LinkType)}>
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              This article is {LINK_LABELS[t].forward}…
            </option>
          ))}
        </select>
      </div>
      {target ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="truncate text-sm text-foreground">{target.title}</span>
          <button type="button" onClick={() => setTargetId('')} className="text-xs text-muted-foreground hover:text-foreground">
            Change
          </button>
        </div>
      ) : (
        <div>
          <Input
            aria-label="Find an article to link"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an article…"
            className="h-9"
          />
          {articles.length <= 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">Create another article to link it here.</p>
          ) : candidates.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No articles match.</p>
          ) : (
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border" role="listbox" aria-label="Articles">
              {candidates.map((a) => (
                <li key={a.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => setTargetId(a.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">{a.title}</span>
                    <TypeBadge type={a.type} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Input
        aria-label="Relationship note"
        value={note}
        maxLength={LIMITS.linkNote}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="h-9"
      />
      <Button type="submit" size="sm" className="w-full" loading={busy} disabled={!targetId}>
        Add relationship
      </Button>
      <FormError message={error} testId="link-error" />
    </form>
  )
}
