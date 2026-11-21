/**
 * Universe members. Everyone sees the roster and their own role; the owner
 * also invites by email, manages pending invitations, changes roles and
 * removes members. Every change is a server action that checks the role
 * again — the controls hidden here are only a convenience.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MailPlus, UserPlus } from 'lucide-react'
import { useAuth } from 'deepspace'
import { Avatar, AvatarFallback, AvatarImage, Button, Input, Label, useToast } from '@/components/ui'
import { RoleBadge } from '@/components/mythos/Badges'
import { ConfirmDialog } from '@/components/mythos/Dialogs'
import { ListSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView, FormError, selectClass } from '@/components/mythos/StatusViews'
import type { PendingInvitation } from '@/actions/members'
import { ASSIGNABLE_ROLES, type AssignableRole } from '@/domain/mythos'
import { useUniverseContext } from '@/features/universes/context'
import { useMembers, type MemberView } from '@/features/universes/hooks'
import { callAction } from '@/lib/actions'
import { relativeTime } from '@/lib/format'

const ROLE_HELP: Record<string, string> = {
  owner: 'Full access: settings, members and every article.',
  editor: 'Writes and edits articles and their connections.',
  viewer: 'Reads everything; changes nothing.',
}

export default function UniverseMembersPage() {
  const { universe, role } = useUniverseContext()
  const isOwner = role === 'owner'
  const invitations = usePendingInvitations(universe.id, isOwner)
  return (
    <div className="mx-auto max-w-3xl space-y-12 px-6 py-10">
      <header>
        <p className="mythos-eyebrow">{universe.name}</p>
        <h1 className="mt-1 text-4xl font-semibold text-foreground">Members</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are {role === 'owner' ? 'the owner' : `${role === 'editor' ? 'an editor' : 'a viewer'}`}. {ROLE_HELP[role]}
        </p>
      </header>
      <MembersSection />
      {isOwner && (
        <Section title="Invite collaborators" description="They get access once they sign in with that email and accept.">
          <InviteForm onInvited={invitations.reload} />
          <PendingInvitations {...invitations} />
        </Section>
      )}
      {!isOwner && <LeaveSection />}
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

function MembersSection() {
  const { universe, role } = useUniverseContext()
  const { members, status } = useMembers(universe.id)
  return (
    <Section title="Current members" description="Owners manage the universe, editors write, viewers read.">
      {status === 'loading' ? (
        <ListSkeleton rows={3} label="Loading members…" />
      ) : status === 'error' ? (
        <ErrorView message="Members could not be loaded." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-testid="member-list">
          {members.map((m) => (
            <MemberRow key={m.membershipId} member={m} canManage={role === 'owner'} />
          ))}
        </ul>
      )}
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
    <li className="flex items-center gap-3 px-4 py-3" data-testid="member-row" data-role={member.role}>
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

type InvitationsState = {
  status: 'loading' | 'ready' | 'error'
  invitations: PendingInvitation[]
  error: string | null
  reload: () => Promise<void>
}

/** The owner's view of pending invitations (fetched through an owner-checked action). */
function usePendingInvitations(universeId: string, enabled: boolean): InvitationsState {
  const [state, setState] = useState<Omit<InvitationsState, 'reload'>>({ status: 'loading', invitations: [], error: null })
  const reload = useCallback(async () => {
    const res = await callAction<{ invitations: PendingInvitation[] }>('listInvitations', { universeId })
    setState(
      res.ok
        ? { status: 'ready', invitations: res.data.invitations, error: null }
        : { status: 'error', invitations: [], error: res.error },
    )
  }, [universeId])
  useEffect(() => {
    if (enabled) void reload()
  }, [enabled, reload])
  return { ...state, reload }
}

function PendingInvitations({ status, invitations, error, reload }: InvitationsState) {
  const toast = useToast()
  const [revoking, setRevoking] = useState<PendingInvitation | null>(null)
  return (
    <div className="space-y-2">
      <h3 className="mythos-eyebrow">Pending invitations</h3>
      {status === 'loading' ? (
        <ListSkeleton rows={1} label="Loading invitations…" />
      ) : status === 'error' ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
          {error ?? 'Invitations could not be loaded.'}
          <Button size="sm" variant="outline" onClick={() => void reload()}>
            Retry
          </Button>
        </div>
      ) : invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invitations are waiting for an answer.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card" data-testid="pending-invitations">
          {invitations.map((inv) => (
            <li key={inv.invitationId} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="pending-invitation">
              <MailPlus className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{inv.email}</span>
              <RoleBadge role={inv.role} />
              <span className="text-xs text-muted-foreground">
                {inv.invitedByName} · {relativeTime(inv.createdAt)}
              </span>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setRevoking(inv)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="Revoke this invitation?"
        description={revoking ? `${revoking.email} will no longer be able to join.` : ''}
        confirmText="Revoke"
        onConfirm={async () => {
          if (!revoking) return null
          const res = await callAction('revokeInvitation', { invitationId: revoking.invitationId })
          if (!res.ok) return res.error
          toast.success('Invitation revoked')
          await reload()
          return null
        }}
      />
    </div>
  )
}

function InviteForm({ onInvited }: { onInvited: () => Promise<void> }) {
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
    const res = await callAction<{ email: string; updated: boolean }>('inviteMember', { universeId: universe.id, email, role })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setEmail('')
    toast.success(
      res.data.updated ? `Updated the invitation for ${res.data.email} to ${role}.` : `Invited ${res.data.email} as ${role}.`,
    )
    await onInvited()
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-4" aria-label="Invite a member">
      <Label htmlFor="invite-email">Invite by email</Label>
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
      <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
      <FormError message={error} testId="invite-error" />
    </form>
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
