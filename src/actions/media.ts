/**
 * Maps and images (ADR-025): a universe's gallery, and the gallery items an
 * article shows. Editors and owners add, edit, delete and attach; every
 * member reads the rows through the RecordRoom. Files are uploaded through
 * the checked `/api/files` proxy first; these actions record them.
 */

import { COLLECTIONS, LIMITS, mediaKeyUniverse } from '../domain/mythos'
import type { ArticleMediaData, MediaData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { deleteMediaFile, mediaFileExists } from '../server/mythos/files'
import { requireArticle, requireOwned, requireRole } from '../server/mythos/membership'
import { drain, mustSucceed, queryAll } from '../server/mythos/store'
import {
  addMediaSchema,
  mediaIdSchema,
  setArticleMediaSchema,
  updateMediaSchema,
} from '../server/mythos/validation'

/** Records an uploaded map or image in the universe's gallery (editor). */
export const addMedia = mythosAction('addMedia', addMediaSchema, async ({ userId, params, tools, system, env }) => {
  await requireRole(tools, userId, params.universeId, 'editor')
  if (mediaKeyUniverse(params.key) !== params.universeId) throw new UserError('That image belongs to another universe.')

  const existing = await queryAll<Pick<MediaData, 'key'>>(tools, COLLECTIONS.media, { where: { universeId: params.universeId } })
  if (existing.length >= LIMITS.mediaPerUniverse) {
    throw new UserError(`A universe can hold at most ${LIMITS.mediaPerUniverse} maps and images. Delete some first.`)
  }
  if (!(await mediaFileExists(env, params.key))) throw new UserError('Upload the image before adding it.')

  const media: MediaData = {
    universeId: params.universeId,
    key: params.key,
    title: params.title,
    caption: params.caption,
    kind: params.kind,
    uploadedBy: userId,
  }
  const created = await system.create(COLLECTIONS.media, { ...media })
  if (!created.success) {
    if (created.error?.startsWith('Duplicate:')) throw new UserError('That image is already in the gallery.')
    throw new Error(`Adding the image failed: ${created.error ?? 'unknown error'}`)
  }
  return { mediaId: created.data.recordId }
})

/** Changes a gallery item's title, caption or kind (editor). */
export const updateMedia = mythosAction('updateMedia', updateMediaSchema, async ({ userId, params, tools, system }) => {
  const { record } = await requireOwned<MediaData>(tools, userId, COLLECTIONS.media, params.mediaId, 'editor', 'Image')
  const { mediaId, ...patch } = params
  await mustSucceed(system.update(COLLECTIONS.media, record.recordId, patch), 'Updating the image')
  return { mediaId }
})

/**
 * Deletes a gallery item (editor): takes it off every article, removes the
 * row, then deletes the file. A file that cannot be deleted is logged; the
 * item is gone from Mythos either way.
 */
export const deleteMedia = mythosAction('deleteMedia', mediaIdSchema, async ({ userId, params, tools, system, env }) => {
  const { record } = await requireOwned<MediaData>(tools, userId, COLLECTIONS.media, params.mediaId, 'editor', 'Image')
  await drain(system, COLLECTIONS.articleMedia, { universeId: record.data.universeId, mediaId: record.recordId })
  await mustSucceed(system.remove(COLLECTIONS.media, record.recordId), 'Deleting the image')
  const fileDeleted = await deleteMediaFile(env, record.data.key)
  return { mediaId: record.recordId, fileDeleted }
})

/**
 * Sets which gallery items an article shows, in order (editor). Every id
 * must be an item of the article's own universe.
 */
export const setArticleMedia = mythosAction(
  'setArticleMedia',
  setArticleMediaSchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    const universeId = article.data.universeId
    const gallery = await queryAll<MediaData>(tools, COLLECTIONS.media, { where: { universeId } })
    const inUniverse = new Set(gallery.map((m) => m.recordId))
    if (params.mediaIds.some((id) => !inUniverse.has(id))) throw new UserError('Image not found')

    const current = await queryAll<ArticleMediaData>(tools, COLLECTIONS.articleMedia, {
      where: { universeId, articleId: article.recordId },
    })
    const wanted = new Map(params.mediaIds.map((id, i) => [id, i]))
    for (const row of current) {
      const order = wanted.get(row.data.mediaId)
      if (order === undefined) {
        await mustSucceed(system.remove(COLLECTIONS.articleMedia, row.recordId), 'Removing an image from the article')
      } else if (row.data.sortOrder !== order) {
        await mustSucceed(system.update(COLLECTIONS.articleMedia, row.recordId, { sortOrder: order }), 'Reordering images')
      }
      wanted.delete(row.data.mediaId)
    }
    for (const [mediaId, sortOrder] of wanted) {
      const row: ArticleMediaData = { universeId, articleId: article.recordId, mediaId, sortOrder }
      const created = await system.create(COLLECTIONS.articleMedia, { ...row })
      // A concurrent save already added it: the unique rule kept one row.
      if (!created.success && !created.error?.startsWith('Duplicate:')) {
        throw new Error(`Adding an image to the article failed: ${created.error ?? 'unknown error'}`)
      }
    }
    return { articleId: article.recordId, mediaIds: params.mediaIds }
  },
)
