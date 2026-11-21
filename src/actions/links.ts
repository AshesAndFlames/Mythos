import { COLLECTIONS } from '../domain/mythos'
import type { ArticleData, ArticleLinkData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { requireArticle, requireOwned } from '../server/mythos/membership'
import { getRecord, mustSucceed, queryAll } from '../server/mythos/store'
import { createLinkSchema, linkIdSchema } from '../server/mythos/validation'

/**
 * Creates a typed relationship from one article to another (editor or owner).
 * The target must be in the SAME universe as the source; a target id from
 * any other universe answers "not found", so ids cannot be probed.
 */
export const createLink = mythosAction('createLink', createLinkSchema, async ({ userId, params, tools, system }) => {
  const { article: from } = await requireArticle(tools, userId, params.fromArticleId, 'editor')
  const universeId = from.data.universeId
  const to = await getRecord<ArticleData>(tools, COLLECTIONS.articles, params.toArticleId)
  if (!to || to.data.universeId !== universeId) throw new UserError('Linked article not found')

  const existing = await queryAll<ArticleLinkData>(tools, COLLECTIONS.articleLinks, {
    where: { universeId, fromArticleId: from.recordId, toArticleId: to.recordId, type: params.type },
  })
  if (existing.length > 0) throw new UserError('That relationship already exists')

  const link: ArticleLinkData = {
    universeId,
    fromArticleId: from.recordId,
    toArticleId: to.recordId,
    type: params.type,
    note: params.note,
  }
  const created = await mustSucceed(system.create(COLLECTIONS.articleLinks, { ...link }), 'Creating the link')
  return { linkId: created.recordId }
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
