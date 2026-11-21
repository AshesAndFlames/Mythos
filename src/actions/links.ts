import { COLLECTIONS } from '../domain/mythos'
import { canonicalLink, isDuplicateLink, LINK_TYPE_META, wouldCreateLoop } from '../domain/relationships'
import type { ArticleData, ArticleLinkData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { requireArticle, requireOwned } from '../server/mythos/membership'
import { getRecord, mustSucceed, queryAll } from '../server/mythos/store'
import { createLinkSchema, linkIdSchema } from '../server/mythos/validation'

/**
 * Creates a typed relationship between two articles (editor or owner).
 *
 * - Both ends must be in the same universe: a target from any other universe
 *   (or that does not exist) answers "not found", so ids cannot be probed.
 * - Self-links are refused by Zod; an equivalent link (either order for
 *   symmetric types) is refused as a duplicate.
 * - Symmetric types are stored in canonical order, so the collection's
 *   `uniqueOn [from, to, type]` also stops a concurrent reverse duplicate.
 * - Hierarchical and ordered types (`acyclic`) may not close a loop.
 */
export const createLink = mythosAction('createLink', createLinkSchema, async ({ userId, params, tools, system }) => {
  const { article: from } = await requireArticle(tools, userId, params.fromArticleId, 'editor')
  const universeId = from.data.universeId
  const to = await getRecord<ArticleData>(tools, COLLECTIONS.articles, params.toArticleId)
  if (!to || to.data.universeId !== universeId) throw new UserError('Linked article not found')

  const sameType = (
    await queryAll<ArticleLinkData>(tools, COLLECTIONS.articleLinks, { where: { universeId, type: params.type } })
  ).map((l) => ({ id: l.recordId, fromArticleId: l.data.fromArticleId, toArticleId: l.data.toArticleId, type: l.data.type }))

  if (isDuplicateLink(sameType, from.recordId, to.recordId, params.type)) {
    throw new UserError('That relationship already exists')
  }
  if (wouldCreateLoop(sameType, from.recordId, to.recordId, params.type)) {
    throw new UserError(LINK_TYPE_META[params.type].loopMessage ?? 'That relationship would create a loop.')
  }

  const link: ArticleLinkData = {
    universeId,
    ...canonicalLink(from.recordId, to.recordId, params.type),
    type: params.type,
    note: params.note,
  }
  const created = await system.create(COLLECTIONS.articleLinks, { ...link })
  if (!created.success) {
    // The unique rule caught a link saved by someone else in the same instant.
    if (created.error?.startsWith('Duplicate:')) throw new UserError('That relationship already exists')
    throw new Error(`Creating the link failed: ${created.error ?? 'unknown error'}`)
  }
  return { linkId: created.data.recordId }
})

/** Deletes a relationship (editor or owner of the link's universe). */
export const deleteLink = mythosAction('deleteLink', linkIdSchema, async ({ userId, params, tools, system }) => {
  const { record } = await requireOwned<ArticleLinkData>(
    tools,
    userId,
    COLLECTIONS.articleLinks,
    params.linkId,
    'editor',
    'Relationship',
  )
  await mustSucceed(system.remove(COLLECTIONS.articleLinks, record.recordId), 'Deleting the link')
  return { linkId: record.recordId }
})
