/**
 * Universe settings. Owners edit details and the cover, manage members and
 * can delete the universe; everyone else sees the roster and can leave.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useAuth } from 'deepspace'
import { Avatar, AvatarFallback, AvatarImage, Button, Input, Label, Textarea, useToast } from '@/components/ui'
import { RoleBadge } from '@/components/mythos/Badges'
import { CoverPicker } from '@/components/mythos/CoverUpload'
import { ConfirmDialog, TypeToConfirmDialog } from '@/components/mythos/Dialogs'
import { ListSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, FormError, selectClass } from '@/components/mythos/StatusViews'
import { ASSIGNABLE_ROLES, LIMITS, type AssignableRole } from '@/domain/mythos'
import { useUniverseContext } from '@/features/universes/context'
import { useMembers, type MemberView } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'

export default function UniverseSettingsPage() {
  const { universe, role } = useUniverseContext()
  const isOwner = role === 'owner'
  return (
    <div className="mx-auto max-w-3xl space-y-12 px-6 py-10">
      <header>
        <p className="mythos-eyebrow">{universe.name}</p>
        <h1 className="mt-1 text-4xl font-semibold text-foreground">{isOwner ? 'Settings' : 'Members'}</h1>
      </header>
      {isOwner && <DetailsSection />}
      <MembersSection />
      {isOwner ? <DangerZone /> : <LeaveSection />}
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

function MembersSection() {
  const { universe, role } = useUniverseContext()
  const { members, status } = useMembers(universe.id)
  const isOwner = role === 'owner'
  return (
    <Section title="Members" description="Owners manage the universe, editors write, viewers read.">
      {status === 'loading' ? (
        <ListSkeleton rows={3} label="Loading members…" />
      ) : status === 'error' ? (
        <ErrorView message="Members could not be loaded." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-testid="member-list">
          {members.map((m) => (
            <MemberRow key={m.membershipId} member={m} canManage={isOwner} />
          ))}
        </ul>
      )}
      {isOwner && <InviteForm />}
    </Section>
  )
}

function MemberRow({ member, canManage }: { member: MemberView; canManage: boolean }) {
  const { universe } = useUniverseContext()
  const { userId } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isSelf = member.userId === userId
  const manageable = canManage && member.role !== 'owner' && !isSelf

  async function changeRole(role: AssignableRole) {
    setBusy(true)
    const res = await callAction('setMemberRole', { universeId: universe.id, userId: member.userId, role })
    setBusy(false)
    if (!res.ok) toast.error(res.error)
    else toast.success(`${member.name} is now ${role === 'editor' ? 'an editor' : 'a viewer'}`)
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3" data-testid="member-row">
      <Avatar className="size-9">
        {member.imageUrl && <AvatarImage src={member.imageUrl} alt="" />}
        <AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {member.name}
        {isSelf && <span className="text-muted-foreground"> (you)</span>}
      </span>
      {manageable ? (
        <>
          <select
            aria-label={`Role for ${member.name}`}
            className={`${selectClass} h-8`}
            value={member.role}
            disabled={busy}
            onChange={(e) => void changeRole(e.target.value as AssignableRole)}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => setRemoving(true)}>
            Remove
          </Button>
        </>
      ) : (
        <RoleBadge role={member.role} />
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Remove ${member.name}?`}
        description="They lose access to this universe immediately. Articles they wrote stay."
        confirmText="Remove member"
        onConfirm={async () => {
          const res = await callAction('removeMember', { universeId: universe.id, userId: member.userId })
          if (!res.ok) return res.error
          toast.success(`${member.name} was removed`)
          return null
        }}
      />
    </li>
  )
}

function InviteForm() {
  const { universe } = useUniverseContext()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction<{ name: string }>('inviteMember', { universeId: universe.id, email, role })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setEmail('')
    toast.success(`${res.data.name || 'They'} can now open this universe as ${role}.`)
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-4" aria-label="Invite a member">
      <Label htmlFor="invite-email">Invite by email</Label>
      <p className="text-xs text-muted-foreground">They need to have signed in to Mythos once.</p>
      <div className="flex flex-wrap gap-2">
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="friend@example.com"
          className="min-w-56 flex-1"
        />
        <select aria-label="Role for the invitee" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button type="submit" loading={busy} disabled={!email.trim()}>
          <UserPlus className="size-4" aria-hidden /> Invite
        </Button>
      </div>
      <FormError message={error} testId="invite-error" />
    </form>
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

function LeaveSection() {
  const { universe } = useUniverseContext()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Leave" className="space-y-3 rounded-xl border border-border p-5">
      <h2 className="text-xl font-semibold text-foreground">Leave this universe</h2>
      <p className="text-sm text-muted-foreground">You will lose access until an owner invites you again.</p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Leave universe
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Leave ${universe.name}?`}
        description="You will lose access until an owner invites you again."
        confirmText="Leave"
        onConfirm={async () => {
          const res = await callAction('removeMember', { universeId: universe.id, userId })
          if (!res.ok) return res.error
          toast.success(`You left ${universe.name}`)
          navigate('/universes', { replace: true })
          return null
        }}
      />
    </section>
  )
}
