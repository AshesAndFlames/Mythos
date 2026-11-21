import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS, coverKeyAllowed } from '../domain/mythos'
import type { ArticleData, CategoryData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { recordActivity } from '../server/mythos/activity'
import { requireArticle, requireRole } from '../server/mythos/membership'
import { lockAndEraseArticles } from '../server/mythos/scrub'
import { drain, getRecord, mustSucceed, queryAll } from '../server/mythos/store'
import { slugify, uniqueSlug } from '../server/mythos/slug'
import {
  articleIdSchema,
  createArticleSchema,
  renameArticleSchema,
  setArticleCategorySchema,
  saveArticleSchema,
  setArticleInfoboxSchema,
} from '../server/mythos/validation'
import { recordRevision } from './revisions'
import { applyArticleTags } from './tags'

async function takenSlugs(tools: ActionTools, universeId: string, exceptId?: string) {
  const articles = await queryAll<Pick<ArticleData, 'slug'>>(tools, COLLECTIONS.articles, {
    where: { universeId },
  })
  return new Set(articles.filter((a) => a.recordId !== exceptId).map((a) => a.data.slug))
}

/** Records an "updated" entry (folded with the same person's recent ones). */
export function logUpdate(
  tools: ActionTools,
  system: ActionTools,
  userId: string,
  universeId: string,
  articleId: string,
  title: string,
) {
  return recordActivity(tools, system, {
    universeId,
    kind: 'article_updated',
    actorId: userId,
    subjectId: articleId,
    subjectTitle: title,
  })
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
      status: 'draft',
      coverImageKey: '',
      editorIds: universe.data.editorIds ?? [universe.data.ownerId],
      ownerId: universe.data.ownerId,
      authorId: userId,
    }
    // A fresh UUID, never an SDK timestamp id: an article id must never be
    // reused, or the new article would inherit any stored body under that key.
    const articleId = crypto.randomUUID()
    await mustSucceed(system.create(COLLECTIONS.articles, { ...article }, articleId), 'Creating the article')
    await recordActivity(tools, system, {
      universeId: params.universeId,
      kind: 'article_created',
      actorId: userId,
      subjectId: articleId,
      subjectTitle: params.title,
    })
    return { articleId, slug }
  },
)

/** Renames an article and regenerates its slug (editor or owner). */
export const renameArticle = mythosAction(
  'renameArticle',
  renameArticleSchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    const slug = uniqueSlug(
      slugify(params.title),
      await takenSlugs(tools, article.data.universeId, article.recordId),
    )
    await mustSucceed(
      system.update(COLLECTIONS.articles, article.recordId, { title: params.title, slug }),
      'Renaming the article',
    )
    await logUpdate(tools, system, userId, article.data.universeId, article.recordId, params.title)
    return { articleId: article.recordId, slug }
  },
)

/**
 * Files an article under a category of the SAME universe, or clears it with
 * '' (editor or owner). A category id from another universe answers
 * "not found", exactly like one that does not exist.
 */
export const setArticleCategory = mythosAction(
  'setArticleCategory',
  setArticleCategorySchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    if (params.categoryId) {
      const category = await getRecord<CategoryData>(tools, COLLECTIONS.categories, params.categoryId)
      if (!category || category.data.universeId !== article.data.universeId) {
        throw new UserError('Category not found')
      }
    }
    await mustSucceed(
      system.update(COLLECTIONS.articles, article.recordId, { categoryId: params.categoryId }),
      'Setting the category',
    )
    await logUpdate(tools, system, userId, article.data.universeId, article.recordId, article.data.title)
    return { articleId: article.recordId, categoryId: params.categoryId }
  },
)

/**
 * Saves an article from the editor in one validated request (editor or
 * owner): title (and slug), type, summary, status, category, cover, tags,
 * and a version of the body when it changed. "Save draft" and "Publish" are
 * this action with `status` set accordingly.
 */
export const saveArticle = mythosAction(
  'saveArticle',
  saveArticleSchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    const universeId = article.data.universeId
    const articleId = article.recordId

    if (!coverKeyAllowed(params.coverImageKey, universeId, article.data.coverImageKey)) {
      throw new UserError('That cover image belongs to another universe.')
    }
    if (params.categoryId) {
      const category = await getRecord<CategoryData>(tools, COLLECTIONS.categories, params.categoryId)
      if (!category || category.data.universeId !== universeId) throw new UserError('Category not found')
    }

    const patch: Partial<ArticleData> = {
      type: params.type,
      summary: params.summary,
      status: params.status,
      categoryId: params.categoryId,
      coverImageKey: params.coverImageKey,
    }
    let slug = article.data.slug
    if (params.title !== article.data.title) {
      slug = uniqueSlug(slugify(params.title), await takenSlugs(tools, universeId, articleId))
      patch.title = params.title
      patch.slug = slug
    }
    await mustSucceed(system.update(COLLECTIONS.articles, articleId, patch), 'Saving the article')
    await applyArticleTags(tools, system, universeId, articleId, params.tags)
    const revision = await recordRevision(
      tools,
      system,
      userId,
      articleId,
      { universeId, title: params.title, summary: params.summary },
      params.content,
      params.note || (params.status === 'published' ? 'Published' : 'Draft saved'),
    )
    // Publishing is its own entry; any other save is an update.
    const publishing = params.status === 'published' && article.data.status !== 'published'
    await recordActivity(tools, system, {
      universeId,
      kind: publishing ? 'article_published' : 'article_updated',
      actorId: userId,
      subjectId: articleId,
      subjectTitle: params.title,
    })
    return { articleId, slug, status: params.status, revision }
  },
)

/** Replaces an article's infobox rows (editor or owner). */
export const setArticleInfobox = mythosAction(
  'setArticleInfobox',
  setArticleInfoboxSchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    await mustSucceed(
      system.update(COLLECTIONS.articles, article.recordId, { infobox: params.infobox }),
      'Saving the infobox',
    )
    await logUpdate(tools, system, userId, article.data.universeId, article.recordId, article.data.title)
    return { articleId: article.recordId }
  },
)

/**
 * Deletes an article with its links (both directions), references, tags and
 * revisions. Its collaborative body is erased and verified empty first
 * (src/server/mythos/scrub.ts); if erasing fails, nothing is deleted.
 */
export const deleteArticle = mythosAction(
  'deleteArticle',
  articleIdSchema,
  async ({ userId, params, tools, system, systemYjs }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    const universeId = article.data.universeId
    const articleId = article.recordId

    await lockAndEraseArticles(system, systemYjs, universeId, [articleId])

    await drain(system, COLLECTIONS.articleLinks, { universeId, fromArticleId: articleId })
    await drain(system, COLLECTIONS.articleLinks, { universeId, toArticleId: articleId })
    await drain(system, COLLECTIONS.articleReferences, { universeId, articleId })
    await drain(system, COLLECTIONS.articleTags, { universeId, articleId })
    await drain(system, COLLECTIONS.articleRevisions, { universeId, articleId })
    await mustSucceed(system.remove(COLLECTIONS.articles, articleId), 'Deleting the article')
    return { articleId }
  },
)
