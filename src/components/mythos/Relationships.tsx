/**
 * Connections between articles: the grouped Connections section (article
 * page and editor) and the picker that adds one. Reads come through the
 * RecordRoom (members only); writes go through the validated `createLink` /
 * `deleteLink` actions, which enforce role, universe and integrity rules.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, ArrowRight, Network, X } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { LIMITS } from '@/domain/mythos'
import {
  endsFor,
  groupConnections,
  isDuplicateLink,
  LINK_TYPE_META,
  linkOptions,
  wouldCreateLoop,
  type Connection,
  type ConnectionDirection,
  type ConnectionGroup,
  type LinkEdge,
} from '@/domain/relationships'
import type { ArticleView, LinkView } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'
import { cn } from '@/lib/utils'
import { TypeBadge } from './Badges'
import { CoverImage } from './CoverImage'
import { ConfirmDialog } from './Dialogs'
import { FormError, selectClass } from './StatusViews'

const toEdge = (l: LinkView): LinkEdge & { note: string } => ({
  id: l.id,
  fromArticleId: l.fromArticleId,
  toArticleId: l.toArticleId,
  type: l.type,
  note: l.note,
})

/** An article's connections, grouped by how they read from it. */
export function useConnections(articleId: string, links: LinkView[], articles: ArticleView[]) {
  return useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]))
    return groupConnections(articleId, links.map(toEdge), byId)
  }, [articleId, links, articles])
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const DIRECTION: Record<ConnectionDirection, { Icon: typeof ArrowRight; label: string }> = {
  outgoing: { Icon: ArrowRight, label: 'Outgoing' },
  incoming: { Icon: ArrowLeft, label: 'Incoming' },
  mutual: { Icon: ArrowLeftRight, label: 'Mutual' },
}

/** What the Connections section shows of the article at the other end. */
type ConnectedArticle = Pick<ArticleView, 'id' | 'title' | 'type' | 'coverImageKey'>

/**
 * The Connections section. `canEdit` adds a remove button to each connection
 * (the server still checks the role). `basePath` is where article links go:
 * `/u` for members, `/p` on the public view.
 */
export function ConnectionsSection({
  groups,
  universeId,
  articleTitle,
  canEdit,
  emptyText,
  compact = false,
  footer,
  basePath = '/u',
}: {
  groups: ConnectionGroup<ConnectedArticle>[]
  universeId: string
  basePath?: '/u' | '/p'
  articleTitle: string
  canEdit: boolean
  emptyText: string
  compact?: boolean
  footer?: React.ReactNode
}) {
  const toast = useToast()
  const [removing, setRemoving] = useState<Connection<ConnectedArticle> | null>(null)
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const count = (d: ConnectionDirection) => groups.filter((g) => g.direction === d).reduce((n, g) => n + g.items.length, 0)
  const mutual = count('mutual')

  return (
    <section
      aria-labelledby="connections-heading"
      data-testid="connections"
      className={cn(
        'rounded-2xl border border-primary/25 bg-card/60',
        compact ? 'p-4' : 'p-5 @2xl:p-7',
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="connections-heading" className={cn('flex items-center gap-2 font-semibold text-foreground', compact ? 'text-lg' : 'text-2xl')}>
          <Network className="size-5 text-primary" aria-hidden />
          Connections
        </h2>
        {total > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="connections-count">
            {total} {total === 1 ? 'connection' : 'connections'} · {count('outgoing')} from here · {count('incoming')} pointing here
            {mutual > 0 && ` · ${mutual} mutual`}
          </p>
        )}
      </header>

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className={cn('mt-5 grid gap-6', !compact && '@3xl:grid-cols-2')}>
          {groups.map((g) => (
            <div key={g.key} data-testid="connection-group" data-group={g.key}>
              <h3 className="mythos-eyebrow mb-2 flex items-center gap-1.5">
                {capitalize(g.label)}
                <span className="font-sans text-[10px] tracking-normal text-muted-foreground">({g.items.length})</span>
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((item) => {
                  const { Icon, label } = DIRECTION[item.direction]
                  return (
                    <li
                      key={item.linkId}
                      data-testid="connection"
                      className="group flex items-center gap-3 rounded-lg border border-border bg-background/40 p-2 transition-colors hover:border-primary/40"
                    >
                      <div className="size-10 shrink-0 overflow-hidden rounded-md">
                        <CoverImage imageKey={item.other.coverImageKey} title={item.other.title} seed={item.other.id} monogramClassName="text-lg" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`${basePath}/${universeId}/a/${item.other.id}`}
                          className="block truncate font-display text-lg font-semibold leading-tight text-foreground hover:text-primary"
                        >
                          {item.other.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <TypeBadge type={item.other.type} />
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Icon className="size-3" aria-hidden />
                            <span className="sr-only">{label}:</span>
                            <span className="italic">{item.label}</span>
                          </span>
                        </div>
                        {item.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.note}</p>}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setRemoving(item)}
                          aria-label={`Remove connection: ${item.label} ${item.other.title}`}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {footer && <div className="mt-5">{footer}</div>}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this connection?"
        description={removing ? `“${articleTitle}” will no longer be ${removing.label} “${removing.other.title}”.` : ''}
        confirmText="Remove"
        onConfirm={async () => {
          if (!removing) return null
          const res = await callAction('deleteLink', { linkId: removing.linkId })
          if (!res.ok) return res.error
          toast.success('Connection removed')
          return null
        }}
      />
    </section>
  )
}

const OPTIONS = linkOptions()

/** Adds a connection from this article (either direction) to another article of the universe. */
export function RelationshipPicker({ article, articles, links }: { article: ArticleView; articles: ArticleView[]; links: LinkView[] }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [targetId, setTargetId] = useState('')
  const [value, setValue] = useState(OPTIONS[0].value)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const option = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]
  const edges = useMemo(() => links.map(toEdge), [links])

  /** Why a candidate can't take this relationship, mirroring the server's checks. */
  const blocked = (otherId: string): string | null => {
    const { fromArticleId, toArticleId } = endsFor(option, article.id, otherId)
    if (isDuplicateLink(edges, fromArticleId, toArticleId, option.type)) return 'already linked'
    if (wouldCreateLoop(edges, fromArticleId, toArticleId, option.type)) return 'would loop'
    return null
  }

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return articles
      .filter((a) => a.id !== article.id && (!needle || a.title.toLowerCase().includes(needle)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 8)
  }, [articles, article.id, query])
  const target = articles.find((a) => a.id === targetId)
  const targetBlocked = target ? blocked(target.id) : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!target) return
    setBusy(true)
    setError(null)
    const res = await callAction('createLink', { ...endsFor(option, article.id, target.id), type: option.type, note })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    toast.success(`Connected to ${target.title}`)
    setTargetId('')
    setQuery('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-background/40 p-3" aria-label="Add a connection">
      <p className="text-sm font-medium text-foreground">Add a connection</p>
      <label className="block text-xs text-muted-foreground" htmlFor="connection-type">
        “{article.title}” is…
      </label>
      <select
        id="connection-type"
        aria-label="Relationship type"
        className={`${selectClass} h-9 w-full`}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
      >
        <optgroup label="From this article">
          {OPTIONS.filter((o) => o.direction === 'outgoing').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {LINK_TYPE_META[o.type].symmetric ? ' (mutual)' : ''}
            </option>
          ))}
        </optgroup>
        <optgroup label="Pointing to this article">
          {OPTIONS.filter((o) => o.direction === 'incoming').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      </select>

      {target ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-foreground">{target.title}</span>
            <TypeBadge type={target.type} />
          </span>
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
            placeholder="Search articles…"
            className="h-9"
          />
          {articles.length <= 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">Create another article to connect it here.</p>
          ) : candidates.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No articles match.</p>
          ) : (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border" aria-label="Matching articles">
              {candidates.map((a) => {
                const why = blocked(a.id)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={why !== null}
                      onClick={() => setTargetId(a.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="truncate">{a.title}</span>
                      {why ? <span className="shrink-0 text-[11px] italic text-muted-foreground">{why}</span> : <TypeBadge type={a.type} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <Input
        aria-label="Connection note"
        value={note}
        maxLength={LIMITS.linkNote}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="h-9"
      />
      {targetBlocked && (
        <p className="text-xs text-muted-foreground">
          {targetBlocked === 'already linked' ? 'These two are already connected this way.' : LINK_TYPE_META[option.type].loopMessage}
        </p>
      )}
      <Button type="submit" size="sm" className="w-full" loading={busy} disabled={!target || targetBlocked !== null}>
        Add connection
      </Button>
      <FormError message={error} testId="link-error" />
    </form>
  )
}
