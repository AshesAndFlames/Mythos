/** Universe home: articles and members. */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useAuth } from 'deepspace'
import { Badge, Button, EmptyState, Input, Label } from '@/components/ui'
import {
  ErrorView,
  FormError,
  LoadingView,
  NotFoundView,
  selectClass,
} from '@/components/mythos/StatusViews'
import {
  ARTICLE_TYPE_LABELS,
  ARTICLE_TYPES,
  ASSIGNABLE_ROLES,
  LIMITS,
  type ArticleType,
  type AssignableRole,
  type UniverseRole,
} from '@/domain/mythos'
import { useArticles, useMembers, useUniverse, type MemberView } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'
import { hasAtLeast } from '@/server/mythos/roles'

export default function UniversePage() {
  const { universeId = '' } = useParams()
  const { universe, role, status } = useUniverse(universeId)

  if (status === 'loading') return <LoadingView />
  if (status === 'error') return <ErrorView message="This universe could not be loaded. Refresh to try again." />
  if (!universe || !role) return <NotFoundView what="Universe" />

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/universes" className="text-sm text-muted-foreground hover:text-foreground">
        ← All universes
      </Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="universe-name">
            {universe.name}
          </h1>
          {universe.tagline && <p className="mt-1 text-muted-foreground">{universe.tagline}</p>}
        </div>
        <Badge variant="secondary" data-testid="my-universe-role">
          {role}
        </Badge>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <ArticlesSection universeId={universeId} role={role} />
        <MembersSection universeId={universeId} role={role} />
      </div>
    </div>
  )
}

function ArticlesSection({ universeId, role }: { universeId: string; role: UniverseRole }) {
  const { articles, status } = useArticles(universeId)
  const canEdit = hasAtLeast(role, 'editor')
  const [creating, setCreating] = useState(false)

  return (
    <section aria-labelledby="articles-heading">
      <div className="flex items-center justify-between">
        <h2 id="articles-heading" className="text-lg font-semibold text-foreground">
          Articles
        </h2>
        {canEdit && !creating && (
          <Button size="sm" onClick={() => setCreating(true)} data-testid="new-article-button">
            New article
          </Button>
        )}
      </div>

      {creating && <CreateArticleForm universeId={universeId} onCancel={() => setCreating(false)} />}

      {status === 'loading' ? (
        <LoadingView label="Loading articles…" />
      ) : status === 'error' ? (
        <ErrorView message="Articles could not be loaded." />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No articles yet"
          description={
            canEdit
              ? 'Start your encyclopedia with a character, a place, or a legend.'
              : 'Editors in this universe have not written anything yet.'
          }
        />
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border" data-testid="article-list">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                to={`/u/${universeId}/a/${a.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
              >
                <span className="font-medium text-foreground">{a.title}</span>
                <span className="text-xs text-muted-foreground">{ARTICLE_TYPE_LABELS[a.type]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CreateArticleForm({ universeId, onCancel }: { universeId: string; onCancel: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ArticleType>('character')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction<{ articleId: string }>('createArticle', { universeId, title, type })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    navigate(`/u/${universeId}/a/${res.data.articleId}`)
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Create an article">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="article-title">Title</Label>
          <Input
            id="article-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIMITS.articleTitle}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="article-type">Type</Label>
          <select
            id="article-type"
            className={selectClass}
            value={type}
            onChange={(e) => setType(e.target.value as ArticleType)}
          >
            {ARTICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {ARTICLE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <FormError message={error} testId="create-article-error" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !title.trim()}>
          {busy ? 'Creating…' : 'Create article'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function MembersSection({ universeId, role }: { universeId: string; role: UniverseRole }) {
  const { members, status } = useMembers(universeId)
  const isOwner = role === 'owner'

  return (
    <section aria-labelledby="members-heading" className="space-y-4">
      <h2 id="members-heading" className="text-lg font-semibold text-foreground">
        Members
      </h2>
      {status === 'loading' ? (
        <LoadingView label="Loading members…" />
      ) : status === 'error' ? (
        <ErrorView message="Members could not be loaded." />
      ) : (
        <ul className="space-y-2" data-testid="member-list">
          {members.map((m) => (
            <MemberRow key={m.membershipId} universeId={universeId} member={m} canManage={isOwner} />
          ))}
        </ul>
      )}
      {isOwner && <InviteForm universeId={universeId} />}
    </section>
  )
}

function MemberRow({
  universeId,
  member,
  canManage,
}: {
  universeId: string
  member: MemberView
  canManage: boolean
}) {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSelf = member.userId === userId
  const manageable = canManage && member.role !== 'owner'

  async function run(name: string, params: Record<string, unknown>, after?: () => void) {
    setBusy(true)
    setError(null)
    const res = await callAction(name, params)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    after?.()
  }

  return (
    <li className="rounded-lg border border-border px-3 py-2" data-testid="member-row">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-foreground">
          {member.name}
          {isSelf && <span className="text-muted-foreground"> (you)</span>}
        </span>
        {manageable ? (
          <select
            aria-label={`Role for ${member.name}`}
            className={`${selectClass} h-8`}
            value={member.role}
            disabled={busy}
            onChange={(e) =>
              run('setMemberRole', {
                universeId,
                userId: member.userId,
                role: e.target.value as AssignableRole,
              })
            }
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <Badge variant="secondary">{member.role}</Badge>
        )}
      </div>
      {(manageable || (isSelf && member.role !== 'owner')) && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-7 px-2 text-xs text-muted-foreground"
          disabled={busy}
          onClick={() =>
            run('removeMember', { universeId, userId: member.userId }, isSelf ? () => navigate('/universes') : undefined)
          }
        >
          {isSelf ? 'Leave universe' : 'Remove'}
        </Button>
      )}
      <FormError message={error} />
    </li>
  )
}

function InviteForm({ universeId }: { universeId: string }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const res = await callAction<{ name: string }>('inviteMember', { universeId, email, role })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setEmail('')
    setNotice(`${res.data.name || 'They'} can now open this universe as ${role}.`)
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-4" aria-label="Invite a member">
      <Label htmlFor="invite-email">Invite by email</Label>
      <Input
        id="invite-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        placeholder="friend@example.com"
      />
      <div className="flex gap-2">
        <select
          aria-label="Role for the invitee"
          className={`${selectClass} flex-1`}
          value={role}
          onChange={(e) => setRole(e.target.value as AssignableRole)}
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? 'Inviting…' : 'Invite'}
        </Button>
      </div>
      <FormError message={error} testId="invite-error" />
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </form>
  )
}
