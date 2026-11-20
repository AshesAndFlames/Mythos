import { COLLECTIONS } from '../domain/mythos'
import type { TeamMemberData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { currentEditorIds, fanOutEditorIds, requireRole } from '../server/mythos/membership'
import { getMembership, mustSucceed, queryAll } from '../server/mythos/store'
import {
  inviteMemberSchema,
  removeMemberSchema,
  setMemberRoleSchema,
} from '../server/mythos/validation'

interface UserRow {
  email?: string
  name?: string
}

/**
 * Adds an existing Mythos user to a universe as editor or viewer (owner only).
 *
 * The invitee is resolved from the app's own `users` collection, so they must
 * have signed in to Mythos once. Only their id and display name come back —
 * never a users row (which would carry their email).
 */
export const inviteMember = mythosAction(
  'inviteMember',
  inviteMemberSchema,
  async ({ userId, params, tools, system }) => {
    await requireRole(tools, userId, params.universeId, 'owner')

    const matches = await queryAll<UserRow>(tools, 'users', { where: { email: params.email } })
    const invitee = matches[0]
    if (!invitee) {
      throw new UserError(
        'No Mythos account uses that email yet. Ask them to sign in to Mythos once, then invite them again.',
      )
    }
    if (invitee.recordId === userId) throw new UserError('You are already the owner of this universe.')

    const existing = await getMembership(tools, params.universeId, invitee.recordId)
    if (existing?.data.Status === 'active') {
      throw new UserError('That person is already a member of this universe.')
    }

    if (existing) {
      await mustSucceed(
        system.update(COLLECTIONS.teamMembers, existing.recordId, {
          Status: 'active',
          role: params.role,
        }),
        'Restoring the membership',
      )
    } else {
      const membership: TeamMemberData = {
        TeamId: params.universeId,
        UserId: invitee.recordId,
        Status: 'active',
        role: params.role,
        invitedBy: userId,
      }
      await mustSucceed(
        system.create(COLLECTIONS.teamMembers, { ...membership }),
        'Creating the membership',
      )
    }

    if (params.role === 'editor') {
      await fanOutEditorIds(system, params.universeId, await currentEditorIds(tools, params.universeId))
    }
    return { userId: invitee.recordId, name: invitee.data.name ?? '' }
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

    const target = await getMembership(tools, params.universeId, params.userId)
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
