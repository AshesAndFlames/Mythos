import type { ActionTools } from 'deepspace/worker'
import { maskEmail } from '../domain/activity'
import { COLLECTIONS, LIMITS, type AssignableRole } from '../domain/mythos'
import type { InvitationData, TeamMemberData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { recordActivity } from '../server/mythos/activity'
import { sendInvitationEmail } from '../server/mythos/invite-email'
import { AccessDenied, currentEditorIds, fanOutEditorIds, requireRole } from '../server/mythos/membership'
import { getMembership, getRecord, getUniverse, mustSucceed, queryAll, type Envelope } from '../server/mythos/store'
import {
  invitationIdSchema,
  inviteMemberSchema,
  noParamsSchema,
  removeMemberSchema,
  respondToInvitationSchema,
  setMemberRoleSchema,
  universeIdSchema,
} from '../server/mythos/validation'

interface UserRow {
  email?: string
  name?: string
}

/**
 * The caller's account email, lower-cased. `email` on a users row is
 * system-assigned from the verified sign-in (clients cannot change it), so
 * it is safe to match invitations against.
 */
async function callerEmail(tools: ActionTools, userId: string): Promise<string> {
  const me = await getRecord<UserRow>(tools, 'users', userId)
  return (me?.data.email ?? '').trim().toLowerCase()
}

async function displayName(tools: ActionTools, userId: string): Promise<string> {
  const row = await getRecord<UserRow>(tools, 'users', userId)
  return row?.data.name || 'Someone'
}

/**
 * Invites an email address to a universe as editor or viewer (owner only).
 *
 * Creates a pending invitation; nothing changes for the invitee until they
 * sign in with that email and accept it. Inviting an address that already
 * has a pending invitation updates its role. The invitee does not need an
 * account yet.
 *
 * Then emails the invitee (ADR-023). The invitation stands whatever happens
 * to the email; `emailStatus` tells the owner whether it went out.
 */
export const inviteMember = mythosAction(
  'inviteMember',
  inviteMemberSchema,
  async ({ userId, params, tools, system }) => {
    const { universe } = await requireRole(tools, userId, params.universeId, 'owner')
    const email = params.email

    if (email === (await callerEmail(tools, userId))) throw new UserError('You are already a member of this universe.')
    const accounts = await queryAll<UserRow>(tools, 'users', { where: { email } })
    for (const account of accounts) {
      const membership = await getMembership(tools, params.universeId, account.recordId)
      if (membership?.data.Status === 'active') throw new UserError('That person is already a member of this universe.')
    }

    const invitations = await queryAll<InvitationData>(tools, COLLECTIONS.invitations, {
      where: { universeId: params.universeId },
    })
    const existing = invitations.find((i) => i.data.email === email)
    let invitationId: string
    if (existing) {
      await mustSucceed(
        system.update(COLLECTIONS.invitations, existing.recordId, { role: params.role, status: 'pending', invitedBy: userId }),
        'Updating the invitation',
      )
      invitationId = existing.recordId
    } else {
      const pending = invitations.filter((i) => i.data.status === 'pending').length
      if (pending >= LIMITS.pendingInvitations) {
        throw new UserError(`This universe already has ${LIMITS.pendingInvitations} pending invitations. Revoke some first.`)
      }
      const invitation: InvitationData = {
        universeId: params.universeId,
        email,
        role: params.role,
        invitedBy: userId,
        status: 'pending',
      }
      const created = await system.create(COLLECTIONS.invitations, { ...invitation })
      if (!created.success) {
        if (created.error?.startsWith('Duplicate:')) throw new UserError('That email was just invited. Refresh to see it.')
        throw new Error(`Creating the invitation failed: ${created.error ?? 'unknown error'}`)
      }
      invitationId = created.data.recordId
    }

    await recordActivity(tools, system, {
      universeId: params.universeId,
      kind: 'member_invited',
      actorId: userId,
      subjectId: invitationId,
      subjectTitle: maskEmail(email),
      detail: params.role,
    })

    const emailStatus = await sendInvitationEmail(system, {
      to: email,
      inviterId: userId,
      inviterName: await displayName(tools, userId),
      universeName: universe.data.name,
      role: params.role,
    })
    return { invitationId, email, role: params.role, updated: existing?.data.status === 'pending', emailStatus }
  },
)

export interface PendingInvitation {
  invitationId: string
  email: string
  role: AssignableRole
  invitedByName: string
  createdAt: string
}

/** A universe's pending invitations, with full emails (owner only). */
export const listInvitations = mythosAction(
  'listInvitations',
  universeIdSchema,
  async ({ userId, params, tools }) => {
    await requireRole(tools, userId, params.universeId, 'owner')
    const rows = await queryAll<InvitationData>(tools, COLLECTIONS.invitations, {
      where: { universeId: params.universeId, status: 'pending' },
    })
    const names = new Map<string, string>()
    for (const r of rows) {
      if (!names.has(r.data.invitedBy)) names.set(r.data.invitedBy, await displayName(tools, r.data.invitedBy))
    }
    const invitations: PendingInvitation[] = rows
      .map((r) => ({
        invitationId: r.recordId,
        email: r.data.email,
        role: r.data.role,
        invitedByName: names.get(r.data.invitedBy) ?? 'Someone',
        createdAt: r.createdAt ?? '',
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { invitations }
  },
)

/** Withdraws a pending invitation (owner of its universe only). */
export const revokeInvitation = mythosAction(
  'revokeInvitation',
  invitationIdSchema,
  async ({ userId, params, tools, system }) => {
    const invitation = await getRecord<InvitationData>(tools, COLLECTIONS.invitations, params.invitationId)
    if (!invitation) throw new AccessDenied('Invitation not found')
    try {
      await requireRole(tools, userId, invitation.data.universeId, 'owner')
    } catch (err) {
      if (err instanceof AccessDenied && err.message === 'Universe not found') throw new AccessDenied('Invitation not found')
      throw err
    }
    if (invitation.data.status !== 'pending') throw new UserError('That invitation was already answered.')
    await mustSucceed(system.remove(COLLECTIONS.invitations, invitation.recordId), 'Revoking the invitation')
    return { invitationId: invitation.recordId }
  },
)

export interface MyInvitation {
  invitationId: string
  universeId: string
  universeName: string
  role: AssignableRole
  invitedByName: string
  createdAt: string
}

/** Pending invitations addressed to the caller's account email. */
export const myInvitations = mythosAction('myInvitations', noParamsSchema, async ({ userId, tools }) => {
  const email = await callerEmail(tools, userId)
  if (!email) return { invitations: [] as MyInvitation[] }
  const rows = await queryAll<InvitationData>(tools, COLLECTIONS.invitations, { where: { email, status: 'pending' } })
  const invitations: MyInvitation[] = []
  for (const r of rows) {
    const universe = await getUniverse(tools, r.data.universeId)
    if (!universe) continue
    invitations.push({
      invitationId: r.recordId,
      universeId: r.data.universeId,
      universeName: universe.data.name,
      role: r.data.role,
      invitedByName: await displayName(tools, r.data.invitedBy),
      createdAt: r.createdAt ?? '',
    })
  }
  invitations.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { invitations }
})

/**
 * Activates (or reactivates) a membership. Returns the role the caller ends
 * up with: an existing active member keeps their role, so accepting can
 * never demote anyone (or touch the owner).
 */
export async function joinUniverse(
  tools: ActionTools,
  system: ActionTools,
  universeId: string,
  userId: string,
  role: AssignableRole,
  invitedBy: string,
): Promise<TeamMemberData['role']> {
  const existing = await getMembership(tools, universeId, userId)
  if (existing?.data.Status === 'active') return existing.data.role
  if (existing) {
    await mustSucceed(
      system.update(COLLECTIONS.teamMembers, existing.recordId, { Status: 'active', role }),
      'Restoring the membership',
    )
  } else {
    const membership: TeamMemberData = { TeamId: universeId, UserId: userId, Status: 'active', role, invitedBy }
    const created = await system.create(COLLECTIONS.teamMembers, { ...membership })
    if (!created.success) {
      // Accepted twice at the same instant: the unique rule kept one row.
      const raced = await getMembership(tools, universeId, userId)
      if (raced?.data.Status === 'active') return raced.data.role
      throw new Error(`Creating the membership failed: ${created.error}`)
    }
  }
  if (role === 'editor') await fanOutEditorIds(system, universeId, await currentEditorIds(tools, universeId))
  return role
}

/**
 * Accepts or declines an invitation addressed to the caller's account email.
 * Any other invitation id — someone else's, answered, revoked, or made up —
 * answers "not found".
 */
export const respondToInvitation = mythosAction(
  'respondToInvitation',
  respondToInvitationSchema,
  async ({ userId, params, tools, system }) => {
    const [invitation, email] = await Promise.all([
      getRecord<InvitationData>(tools, COLLECTIONS.invitations, params.invitationId),
      callerEmail(tools, userId),
    ])
    if (!invitation || invitation.data.status !== 'pending' || !email || invitation.data.email !== email) {
      throw new AccessDenied('Invitation not found')
    }
    const universeId = invitation.data.universeId
    const universe = await getUniverse(tools, universeId)
    if (!universe) {
      await mustSucceed(system.remove(COLLECTIONS.invitations, invitation.recordId), 'Clearing the invitation')
      throw new UserError('That universe no longer exists.')
    }

    if (!params.accept) {
      await mustSucceed(system.update(COLLECTIONS.invitations, invitation.recordId, { status: 'declined' }), 'Declining')
      return { universeId, accepted: false as const }
    }

    const role = await joinUniverse(tools, system, universeId, userId, invitation.data.role, invitation.data.invitedBy)
    await mustSucceed(system.update(COLLECTIONS.invitations, invitation.recordId, { status: 'accepted' }), 'Accepting')
    await recordActivity(tools, system, { universeId, kind: 'member_joined', actorId: userId, detail: role })
    return { universeId, universeName: universe.data.name, role, accepted: true as const }
  },
)

/** Changes a member between editor and viewer (owner only). */
export const setMemberRole = mythosAction(
  'setMemberRole',
  setMemberRoleSchema,
  async ({ userId, params, tools, system }) => {
    await requireRole(tools, userId, params.universeId, 'owner')
    const target = await getMembership(tools, params.universeId, params.userId)
    if (!target || target.data.Status !== 'active') throw new UserError('That person is not a member.')
    if (target.data.role === 'owner') throw new UserError("The owner's role cannot be changed.")

    if (target.data.role !== params.role) {
      await mustSucceed(
        system.update(COLLECTIONS.teamMembers, target.recordId, { role: params.role }),
        'Changing the role',
      )
      await fanOutEditorIds(system, params.universeId, await currentEditorIds(tools, params.universeId))
    }
    return { userId: params.userId, role: params.role }
  },
)

/**
 * Removes a member (owner only), or lets a member leave (anyone, for
 * themselves). The owner can neither be removed nor leave.
 */
export const removeMember = mythosAction(
  'removeMember',
  removeMemberSchema,
  async ({ userId, params, tools, system }) => {
    const leaving = params.userId === userId
    await requireRole(tools, userId, params.universeId, leaving ? 'viewer' : 'owner')

    const target: Envelope<TeamMemberData> | null = await getMembership(tools, params.universeId, params.userId)
    if (!target || target.data.Status !== 'active') throw new UserError('That person is not a member.')
    if (target.data.role === 'owner') {
      throw new UserError(
        leaving ? 'The owner cannot leave their own universe.' : 'The owner cannot be removed.',
      )
    }

    await mustSucceed(system.remove(COLLECTIONS.teamMembers, target.recordId), 'Removing the member')
    if (target.data.role === 'editor') {
      await fanOutEditorIds(system, params.universeId, await currentEditorIds(tools, params.universeId))
    }
    return { userId: params.userId }
  },
)
