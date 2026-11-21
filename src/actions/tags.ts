import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS } from '../domain/mythos'
import type { ArticleTagData, TagData } from '../domain/records'
import { mythosAction } from '../server/mythos/action'
import { recordActivity } from '../server/mythos/activity'
import { requireArticle, requireOwned } from '../server/mythos/membership'
import { drain, mustSucceed, queryAll } from '../server/mythos/store'
import { slugify } from '../server/mythos/slug'
import { setArticleTagsSchema, tagIdSchema } from '../server/mythos/validation'

/**
 * Makes an article's tags exactly `names` (already Zod-validated). Tags are
 * matched by slug within the universe and created when new; joins are added
 * and removed to match. Tags left unused stay, for reuse. The caller must
 * already have authorized the article for 'editor'.
 */
export async function applyArticleTags(
  tools: ActionTools,
  system: ActionTools,
  universeId: string,
  articleId: string,
  names: string[],
): Promise<string[]> {
  // Dedupe by slug; first spelling wins.
  const wanted = new Map<string, string>()
  for (const name of names) {
    const slug = slugify(name).slice(0, 40)
    if (!wanted.has(slug)) wanted.set(slug, name)
  }

  const existingTags = await queryAll<TagData>(tools, COLLECTIONS.tags, { where: { universeId } })
  const tagIdBySlug = new Map(existingTags.map((t) => [t.data.slug, t.recordId]))
  for (const [slug, name] of wanted) {
    if (tagIdBySlug.has(slug)) continue
    const tag: TagData = { universeId, name, slug }
    const created = await mustSucceed(system.create(COLLECTIONS.tags, { ...tag }), 'Creating a tag')
    tagIdBySlug.set(slug, created.recordId)
  }
  const wantedIds = new Set([...wanted.keys()].map((slug) => tagIdBySlug.get(slug) as string))

  const joins = await queryAll<ArticleTagData>(tools, COLLECTIONS.articleTags, {
    where: { universeId, articleId },
  })
  const current = new Set(joins.map((j) => j.data.tagId))
  for (const join of joins) {
    if (!wantedIds.has(join.data.tagId)) {
      await mustSucceed(system.remove(COLLECTIONS.articleTags, join.recordId), 'Removing a tag')
    }
  }
  for (const tagId of wantedIds) {
    if (current.has(tagId)) continue
    const join: ArticleTagData = { universeId, articleId, tagId }
    await mustSucceed(system.create(COLLECTIONS.articleTags, { ...join }), 'Adding a tag')
  }
  return [...wantedIds]
}

/** Replaces an article's tags (editor or owner). */
export const setArticleTags = mythosAction(
  'setArticleTags',
  setArticleTagsSchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    const tagIds = await applyArticleTags(tools, system, article.data.universeId, article.recordId, params.tags)
    await recordActivity(tools, system, {
      universeId: article.data.universeId,
      kind: 'article_updated',
      actorId: userId,
      subjectId: article.recordId,
      subjectTitle: article.data.title,
    })
    return { articleId: article.recordId, tagIds }
  },
)

/** Deletes a tag from its universe and from every article (editor or owner). */
export const deleteTag = mythosAction('deleteTag', tagIdSchema, async ({ userId, params, tools, system }) => {
  const { record } = await requireOwned<TagData>(tools, userId, COLLECTIONS.tags, params.tagId, 'editor', 'Tag')
  await drain(system, COLLECTIONS.articleTags, { universeId: record.data.universeId, tagId: record.recordId })
  await mustSucceed(system.remove(COLLECTIONS.tags, record.recordId), 'Deleting the tag')
  return { tagId: record.recordId }
})
