import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS, coverKeyAllowed, LIMITS } from '../domain/mythos'
import type { ArticleData, MediaData, TeamMemberData, UniverseData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { deleteMediaFile } from '../server/mythos/files'
import { requireRole } from '../server/mythos/membership'
import { lockAndEraseArticles } from '../server/mythos/scrub'
import { drain, mustSucceed, queryAll } from '../server/mythos/store'
import { slugify, uniqueSlug } from '../server/mythos/slug'
import {
  createUniverseSchema,
  deleteUniverseSchema,
  updateUniverseSettingsSchema,
} from '../server/mythos/validation'

/** The caller's own universes (slugs are unique per owner). */
function ownedUniverses(tools: ActionTools, ownerId: string) {
  return queryAll<Pick<UniverseData, 'slug'>>(tools, COLLECTIONS.universes, { where: { ownerId } })
}

/**
 * Creates a universe owned by the caller, plus their owner membership.
 * Both rows are written by the system identity (see mythos-schemas.ts).
 */
export const createUniverse = mythosAction(
  'createUniverse',
  createUniverseSchema,
  async ({ userId, params, tools, system }) => {
    const owned = await ownedUniverses(tools, userId)
    if (owned.length >= LIMITS.universesPerOwner) {
      throw new UserError(`You can own at most ${LIMITS.universesPerOwner} universes.`)
    }
    const universeId = crypto.randomUUID()
    const slug = uniqueSlug(slugify(params.name), new Set(owned.map((u) => u.data.slug)))
    const universe: UniverseData = {
      teamId: universeId,
      name: params.name,
      slug,
      tagline: params.tagline,
      description: params.description,
      artStyle: params.artStyle,
      coverImageKey: '',
      visibility: 'private',
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

    return { universeId, slug }
  },
)

/** Changes a universe's settings (owner only). Renaming regenerates the slug. */
export const updateUniverse = mythosAction(
  'updateUniverse',
  updateUniverseSettingsSchema,
  async ({ userId, params, tools, system }) => {
    const { universe } = await requireRole(tools, userId, params.universeId, 'owner')
    const { universeId, ...changes } = params
    if (
      changes.coverImageKey !== undefined &&
      !coverKeyAllowed(changes.coverImageKey, universeId, universe.data.coverImageKey)
    ) {
      throw new UserError('That cover image belongs to another universe.')
    }
    const patch: Partial<UniverseData> = { ...changes }

    if (changes.name !== undefined && changes.name !== universe.data.name) {
      const owned = await ownedUniverses(tools, universe.data.ownerId)
      const taken = new Set(owned.filter((u) => u.recordId !== universeId).map((u) => u.data.slug))
      patch.slug = uniqueSlug(slugify(changes.name), taken)
    }

    await mustSucceed(system.update(COLLECTIONS.universes, universeId, patch), 'Updating the universe')
    return { universeId, slug: patch.slug ?? universe.data.slug }
  },
)

/**
 * Deletes a universe and everything in it (owner only). The caller confirms
 * by sending the universe's exact name. Content goes first and memberships
 * last: a failure part-way leaves either a universe its owner can still open
 * and delete again, or (after the universe row) membership rows that point at
 * nothing and are ignored.
 */
export const deleteUniverse = mythosAction(
  'deleteUniverse',
  deleteUniverseSchema,
  async ({ userId, params, tools, system, systemYjs, env }) => {
    const { universe } = await requireRole(tools, userId, params.universeId, 'owner')
    if (params.confirmName.trim() !== universe.data.name) {
      throw new UserError('Type the universe name exactly to confirm deletion.')
    }
    const universeId = params.universeId

    // Every article body is erased and verified before any row is deleted.
    const articles = await queryAll<Pick<ArticleData, 'title'>>(tools, COLLECTIONS.articles, {
      where: { universeId },
    })
    await lockAndEraseArticles(
      system,
      systemYjs,
      universeId,
      articles.map((a) => a.recordId),
    )
    // Gallery files go with the universe (ADR-025). A file that cannot be
    // deleted is logged by deleteMediaFile; its row is removed regardless.
    const media = await queryAll<Pick<MediaData, 'key'>>(tools, COLLECTIONS.media, { where: { universeId } })
    for (const m of media) await deleteMediaFile(env, m.data.key)

    for (const collection of [
      COLLECTIONS.articleMedia,
      COLLECTIONS.media,
      COLLECTIONS.articleTags,
      COLLECTIONS.tags,
      COLLECTIONS.articleRevisions,
      COLLECTIONS.articleLinks,
      COLLECTIONS.articleReferences,
      COLLECTIONS.articles,
      COLLECTIONS.categories,
      COLLECTIONS.activity,
      COLLECTIONS.invitations,
    ]) {
      await drain(system, collection, { universeId })
    }
    await mustSucceed(system.remove(COLLECTIONS.universes, universeId), 'Deleting the universe')
    await drain(system, COLLECTIONS.teamMembers, { TeamId: universeId })
    return { universeId }
  },
)
