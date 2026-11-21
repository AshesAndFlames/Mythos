import { COLLECTIONS } from '../domain/mythos'
import type { ArticleTagData, TagData } from '../domain/records'
import { mythosAction } from '../server/mythos/action'
import { requireArticle, requireOwned } from '../server/mythos/membership'
import { drain, mustSucceed, queryAll } from '../server/mythos/store'
import { slugify } from '../server/mythos/slug'
import { setArticleTagsSchema, tagIdSchema } from '../server/mythos/validation'

/**
 * Replaces an article's tags with `tags` (editor or owner). Tags are matched
 * by slug within the article's universe and created when new; joins are
 * added and removed to match. Tags left unused stay, for reuse.
 */
export const setArticleTags = mythosAction(
  'setArticleTags',
  setArticleTagsSchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    const universeId = article.data.universeId
    const articleId = article.recordId

    // Dedupe by slug; first spelling wins.
    const wanted = new Map<string, string>()
    for (const name of params.tags) {
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

    return { articleId, tagIds: [...wantedIds] }
  },
)

/** Deletes a tag from its universe and from every article (editor or owner). */
export const deleteTag = mythosAction('deleteTag', tagIdSchema, async ({ userId, params, tools, system }) => {
  const { record } = await requireOwned<TagData>(tools, userId, COLLECTIONS.tags, params.tagId, 'editor', 'Tag')
  await drain(system, COLLECTIONS.articleTags, { universeId: record.data.universeId, tagId: record.recordId })
  await mustSucceed(system.remove(COLLECTIONS.tags, record.recordId), 'Deleting the tag')
  return { tagId: record.recordId }
})
