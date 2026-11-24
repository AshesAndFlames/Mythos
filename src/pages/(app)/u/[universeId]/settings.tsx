/**
 * Universe settings (owner only): details, cover, visibility and deletion. Members are
 * managed on the Members page. The server refuses these actions for anyone
 * but the owner; this page only spares others controls they cannot use.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, Label, Textarea, useToast } from '@/components/ui'
import { CoverPicker } from '@/components/mythos/CoverUpload'
import { TypeToConfirmDialog } from '@/components/mythos/Dialogs'
import { FormError } from '@/components/mythos/StatusViews'
import { LIMITS, type UniverseVisibility } from '@/domain/mythos'
import { useUniverseContext } from '@/features/universes/context'
import { callAction } from '@/lib/actions'

export default function UniverseSettingsPage() {
  const { universe, role } = useUniverseContext()
  const isOwner = role === 'owner'
  return (
    <div className="mx-auto max-w-3xl space-y-12 px-6 py-10">
      <header>
        <p className="mythos-eyebrow">{universe.name}</p>
        <h1 className="mt-1 text-4xl font-semibold text-foreground">Settings</h1>
      </header>
      {isOwner ? (
        <>
          <DetailsSection />
          <VisibilitySection />
          <DangerZone />
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground" data-testid="settings-owner-only">
          Only the owner of {universe.name} can change its settings.{' '}
          <Link to={`/u/${universe.id}/members`} className="text-primary hover:underline">
            See the members
          </Link>
        </div>
      )}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function DetailsSection() {
  const { universe } = useUniverseContext()
  const toast = useToast()
  const [name, setName] = useState(universe.name)
  const [tagline, setTagline] = useState(universe.tagline)
  const [description, setDescription] = useState(universe.description)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = name !== universe.name || tagline !== universe.tagline || description !== universe.description

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction('updateUniverse', { universeId: universe.id, name, tagline, description })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    toast.success('Universe updated')
  }

  async function setCover(coverImageKey: string) {
    const res = await callAction('updateUniverse', { universeId: universe.id, coverImageKey })
    if (!res.ok) toast.error(res.error)
    else toast.success(coverImageKey ? 'Cover updated' : 'Cover removed')
  }

  return (
    <Section title="Details" description="Members see these on the universe's home.">
      <CoverPicker value={universe.coverImageKey} title={universe.name} seed={universe.id} onChange={setCover} onError={(m) => toast.error(m)} />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Name</Label>
          <Input id="settings-name" value={name} maxLength={LIMITS.universeName} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-tagline">Tagline</Label>
          <Input id="settings-tagline" value={tagline} maxLength={LIMITS.universeTagline} onChange={(e) => setTagline(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            rows={5}
            value={description}
            maxLength={LIMITS.universeDescription}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <FormError message={error} testId="settings-error" />
        <Button type="submit" loading={busy} disabled={!changed || !name.trim()}>
          Save changes
        </Button>
      </form>
    </Section>
  )
}

const VISIBILITY_OPTIONS: { value: UniverseVisibility; label: string; help: string }[] = [
  {
    value: 'private',
    label: 'Private',
    help: 'Only members can find or read it. People join by invitation.',
  },
  {
    value: 'public',
    label: 'Public',
    help:
      'Listed on Explore. Anyone signed in to Mythos can read its published articles, and can join as a viewer. Viewers see everything members see, including drafts, the activity feed and the member list.',
  },
]

function VisibilitySection() {
  const { universe } = useUniverseContext()
  const toast = useToast()
  const [value, setValue] = useState<UniverseVisibility>(universe.visibility ?? 'private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction('updateUniverse', { universeId: universe.id, visibility: value })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    toast.success(value === 'public' ? `${universe.name} is now public` : `${universe.name} is now private`)
  }

  return (
    <Section title="Visibility" description="Who can find and read this universe.">
      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2" aria-label="Visibility">
          {VISIBILITY_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 has-[:checked]:border-primary/50"
            >
              <input
                type="radio"
                name="visibility"
                value={o.value}
                checked={value === o.value}
                onChange={() => setValue(o.value)}
                className="mt-1 accent-[var(--primary)]"
                data-testid={`visibility-${o.value}`}
              />
              <span>
                <span className="block font-medium text-foreground">{o.label}</span>
                <span className="block text-sm text-muted-foreground">{o.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground">
          Making it private again hides it from Explore and non-members straight away. People who already joined stay members
          until you remove them.
        </p>
        <FormError message={error} testId="visibility-error" />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={busy} disabled={value === (universe.visibility ?? 'private')} data-testid="save-visibility">
            Save visibility
          </Button>
          {universe.visibility === 'public' && (
            <Link to={`/p/${universe.id}`} className="text-sm text-primary hover:underline">
              See the public page
            </Link>
          )}
        </div>
      </form>
    </Section>
  )
}

function DangerZone() {
  const { universe } = useUniverseContext()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Danger zone" className="space-y-3 rounded-xl border border-destructive/40 p-5">
      <h2 className="text-xl font-semibold text-destructive">Delete this universe</h2>
      <p className="text-sm text-muted-foreground">
        Every article, body, version, category, tag and relationship is erased, and all members lose access. This cannot be undone.
      </p>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete universe
      </Button>
      <TypeToConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${universe.name}?`}
        description="This permanently erases the universe for everyone."
        expected={universe.name}
        confirmText="Delete forever"
        onConfirm={async (confirmName) => {
          const res = await callAction('deleteUniverse', { universeId: universe.id, confirmName })
          if (!res.ok) return res.error
          toast.success(`${universe.name} was deleted`)
          navigate('/universes', { replace: true })
          return null
        }}
      />
    </section>
  )
}
