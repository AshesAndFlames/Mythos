import { COLLECTIONS } from '../domain/mythos'
import type { TeamMemberData, UniverseData } from '../domain/records'
import { mythosAction } from '../server/mythos/action'
import { mustSucceed } from '../server/mythos/store'
import { createUniverseSchema } from '../server/mythos/validation'

/**
 * Creates a universe owned by the caller, plus their owner membership.
 * Both rows are written by the system identity (see mythos-schemas.ts).
 */
export const createUniverse = mythosAction(
  'createUniverse',
  createUniverseSchema,
  async ({ userId, params, system }) => {
    const universeId = crypto.randomUUID()
    const universe: UniverseData = {
      teamId: universeId,
      name: params.name,
      tagline: params.tagline,
      description: params.description,
      artStyle: params.artStyle,
      coverImageKey: '',
      ownerId: userId,
      editorIds: [userId],
    }
    await mustSucceed(
      system.create(COLLECTIONS.universes, { ...universe }, universeId),
      'Creating the universe',
    )

    const membership: TeamMemberData = {
      TeamId: universeId,
      UserId: userId,
      Status: 'active',
      role: 'owner',
      invitedBy: userId,
    }
    const created = await system.create(COLLECTIONS.teamMembers, { ...membership })
    if (!created.success) {
      // Never leave an ownerless universe behind.
      await system.remove(COLLECTIONS.universes, universeId)
      throw new Error(`Creating the owner membership failed: ${created.error}`)
    }

    return { universeId }
  },
)
