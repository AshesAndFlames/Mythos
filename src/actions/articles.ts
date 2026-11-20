import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS } from '../domain/mythos'
import type { ArticleData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { requireRole } from '../server/mythos/membership'
import { getArticle, mustSucceed, queryAll } from '../server/mythos/store'
import { slugify, uniqueSlug } from '../server/mythos/slug'
import {
  articleIdSchema,
  createArticleSchema,
  renameArticleSchema,
} from '../server/mythos/validation'

async function takenSlugs(tools: ActionTools, universeId: string, exceptId?: string) {
  const articles = await queryAll<Pick<ArticleData, 'slug'>>(tools, COLLECTIONS.articles, {
    where: { universeId },
  })
  return new Set(articles.filter((a) => a.recordId !== exceptId).map((a) => a.data.slug))
}

/** Creates an article in a universe (editor or owner). */
export const createArticle = mythosAction(
  'createArticle',
  createArticleSchema,
  async ({ userId, params, tools, system }) => {
    const { universe } = await requireRole(tools, userId, params.universeId, 'editor')
    const slug = uniqueSlug(slugify(params.title), await takenSlugs(tools, params.universeId))

    const article: ArticleData = {
      universeId: params.universeId,
      title: params.title,
      slug,
      type: params.type,
      summary: params.summary,
      infobox: [],
      categoryId: '',
      tags: [],
      status: 'draft',
      coverImageKey: '',
      editorIds: universe.data.editorIds ?? [universe.data.ownerId],
      ownerId: universe.data.ownerId,
      authorId: userId,
    }
    const created = await mustSucceed(
      system.create(COLLECTIONS.articles, { ...article }),
      'Creating the article',
    )
    return { articleId: created.recordId, slug }
  },
)

/** Renames an article and regenerates its slug (editor or owner). */
export const renameArticle = mythosAction(
  'renameArticle',
  renameArticleSchema,
  async ({ userId, params, tools, system }) => {
    const article = await getArticle(tools, params.articleId)
    if (!article) throw new UserError('Article not found')
    await requireRole(tools, userId, article.data.universeId, 'editor')

    const slug = uniqueSlug(
      slugify(params.title),
      await takenSlugs(tools, article.data.universeId, article.recordId),
    )
    await mustSucceed(
      system.update(COLLECTIONS.articles, article.recordId, { title: params.title, slug }),
      'Renaming the article',
    )
    return { articleId: article.recordId, slug }
  },
)

/** Deletes `where`-matching rows page by page (deleteWhere caps one call at 500). */
async function drain(tools: ActionTools, collection: string, where: Record<string, unknown>) {
  const LIMIT = 500
  for (;;) {
    const res = await mustSucceed(tools.deleteWhere(collection, where, LIMIT), `Deleting ${collection}`)
    if (res.deleted < LIMIT) return
  }
}

/** Deletes an article with its links (both directions) and references (editor or owner). */
export const deleteArticle = mythosAction(
  'deleteArticle',
  articleIdSchema,
  async ({ userId, params, tools, system }) => {
    const article = await getArticle(tools, params.articleId)
    if (!article) throw new UserError('Article not found')
    const universeId = article.data.universeId
    await requireRole(tools, userId, universeId, 'editor')

    await drain(system, COLLECTIONS.articleLinks, { universeId, fromArticleId: article.recordId })
    await drain(system, COLLECTIONS.articleLinks, { universeId, toArticleId: article.recordId })
    await drain(system, COLLECTIONS.articleReferences, { universeId, articleId: article.recordId })
    await mustSucceed(system.remove(COLLECTIONS.articles, article.recordId), 'Deleting the article')
    return { articleId: article.recordId }
  },
)
