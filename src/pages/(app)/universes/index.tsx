/** "My universes": every universe the caller belongs to, plus creation. */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe2 } from 'lucide-react'
import { useMutations } from 'deepspace'
import { Badge, Button, EmptyState, Input, Label, Textarea } from '@/components/ui'
import { ErrorView, FormError, LoadingView } from '@/components/mythos/StatusViews'
import { COLLECTIONS, LIMITS } from '@/domain/mythos'
import { useMyUniverses } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'

export default function UniversesPage() {
  const { universes, status } = useMyUniverses()
  const [creating, setCreating] = useState(false)

  if (status === 'loading') return <LoadingView label="Loading your universes…" />
  if (status === 'error') return <ErrorView message="Your universes could not be loaded. Refresh to try again." />

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Your universes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Worlds you own or have been invited to.</p>
        </div>
        {!creating && universes.length > 0 && (
          <Button onClick={() => setCreating(true)} data-testid="new-universe-button">
            New universe
          </Button>
        )}
      </header>

      {creating && <CreateUniverseForm onCancel={() => setCreating(false)} />}

      {universes.length === 0 && !creating ? (
        <EmptyState
          className="mt-10"
          icon={<Globe2 />}
          title="No universes yet"
          description="Create your first universe, or ask a friend to invite you to theirs."
          action={{ label: 'Create a universe', onClick: () => setCreating(true) }}
        />
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="universe-list">
          {universes.map((u) => (
            <li key={u.id}>
              <Link
                to={`/u/${u.id}`}
                className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-foreground">{u.name}</h2>
                  <Badge variant="secondary">{u.role}</Badge>
                </div>
                {u.tagline && <p className="mt-1 text-sm text-muted-foreground">{u.tagline}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CreateUniverseForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate()
  const { ready } = useMutations(COLLECTIONS.universes)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction<{ universeId: string }>('createUniverse', { name, tagline })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    navigate(`/u/${res.data.universeId}`)
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5" aria-label="Create a universe">
      <div className="space-y-1.5">
        <Label htmlFor="universe-name">Name</Label>
        <Input
          id="universe-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.universeName}
          required
          autoFocus
          placeholder="The Shattered Realms"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="universe-tagline">Tagline (optional)</Label>
        <Textarea
          id="universe-tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={LIMITS.universeTagline}
          rows={2}
          placeholder="Seven kingdoms, one broken sky."
        />
      </div>
      <FormError message={error} testId="create-universe-error" />
      <div className="flex gap-2">
        <Button type="submit" disabled={!ready || busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create universe'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
