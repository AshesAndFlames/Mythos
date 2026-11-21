/**
 * Invitations addressed to the signed-in user, with accept and decline.
 * They are matched on the server against the account's verified email; this
 * panel only lists what `myInvitations` returns and calls
 * `respondToInvitation`, which checks again.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MailOpen } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import type { MyInvitation } from '@/actions/members'
import { callAction } from '@/lib/actions'
import { relativeTime } from '@/lib/format'
import { RoleBadge } from './Badges'

export function InvitationsPanel() {
  const toast = useToast()
  const navigate = useNavigate()
  const [invitations, setInvitations] = useState<MyInvitation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await callAction<{ invitations: MyInvitation[] }>('myInvitations', {})
    if (res.ok) {
      setInvitations(res.data.invitations)
      setError(null)
    } else {
      setError(res.error)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function respond(inv: MyInvitation, accept: boolean) {
    setBusy(inv.invitationId)
    const res = await callAction<{ universeId: string }>('respondToInvitation', { invitationId: inv.invitationId, accept })
    setBusy(null)
    if (!res.ok) {
      toast.error(res.error)
      await load()
      return
    }
    setInvitations((list) => (list ?? []).filter((i) => i.invitationId !== inv.invitationId))
    if (accept) {
      toast.success(`You joined ${inv.universeName} as ${inv.role}`)
      navigate(`/u/${inv.universeId}`)
    } else {
      toast.success(`Declined the invitation to ${inv.universeName}`)
    }
  }

  if (error) {
    return (
      <div role="alert" className="mb-10 flex items-center gap-3 rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
        Your invitations could not be loaded: {error}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    )
  }
  if (!invitations || invitations.length === 0) return null

  return (
    <section aria-labelledby="invitations-heading" className="mb-10 space-y-3" data-testid="my-invitations">
      <h2 id="invitations-heading" className="flex items-center gap-2 text-2xl font-semibold text-foreground">
        <MailOpen className="size-5 text-primary" aria-hidden /> Invitations
      </h2>
      <ul className="space-y-2">
        {invitations.map((inv) => (
          <li
            key={inv.invitationId}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-card p-4"
            data-testid="my-invitation"
          >
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-semibold text-foreground">{inv.universeName}</p>
              <p className="text-xs text-muted-foreground">
                {inv.invitedByName} invited you {relativeTime(inv.createdAt)}
              </p>
            </div>
            <RoleBadge role={inv.role} />
            <Button size="sm" loading={busy === inv.invitationId} disabled={busy !== null} onClick={() => void respond(inv, true)}>
              Accept
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void respond(inv, false)}>
              Decline
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
