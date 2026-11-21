import { COLLECTIONS, LIMITS } from '../domain/mythos'
import type { ArticleRevisionData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { requireArticle, requireOwned } from '../server/mythos/membership'
import { mustSucceed, queryAll } from '../server/mythos/store'
import { revisionFingerprint } from '../server/mythos/richtext'
import { slugify, uniqueSlug } from '../server/mythos/slug'
import { revisionIdSchema, saveRevisionSchema } from '../server/mythos/validation'
import type { ArticleData } from '../domain/records'

/**
 * Saves a version of an article (editor or owner).
 *
 * Title and summary come from the server's copy of the article. The body is
 * the editor's rich-text snapshot, validated by `richTextDocSchema` (ADR-017).
 * A save identical to the latest version is skipped, so autosave-style calls
 * only keep meaningful changes. Beyond LIMITS.revisionsPerArticle, the
 * oldest versions are pruned.
 */
export const saveRevision = mythosAction(
  'saveRevision',
  saveRevisionSchema,
  async ({ userId, params, tools, system }) => {
    const { article } = await requireArticle(tools, userId, params.articleId, 'editor')
    const { universeId, title, summary } = article.data
    const fingerprint = await revisionFingerprint(title, summary, params.content)

    const revisions = await queryAll<Pick<ArticleRevisionData, 'number' | 'fingerprint'>>(
      tools,
      COLLECTIONS.articleRevisions,
      { where: { universeId, articleId: article.recordId } },
    )
    revisions.sort((a, b) => a.data.number - b.data.number)
    const latest = revisions.at(-1)
    if (latest && latest.data.fingerprint === fingerprint) {
      return { saved: false as const, revisionId: latest.recordId, number: latest.data.number }
    }

    const revision: ArticleRevisionData = {
      universeId,
      articleId: article.recordId,
      number: (latest?.data.number ?? 0) + 1,
      title,
      summary,
      content: params.content,
      fingerprint,
      authorId: userId,
      note: params.note,
    }
    // `uniqueOn: [articleId, number]` turns a concurrent save into a failure
    // here rather than two revisions with the same number.
    const created = await system.create(COLLECTIONS.articleRevisions, { ...revision })
    if (!created.success) {
      throw new UserError('Another version was saved at the same moment. Please save again.')
    }

    const excess = revisions.length + 1 - LIMITS.revisionsPerArticle
    for (const old of revisions.slice(0, Math.max(0, excess))) {
      await mustSucceed(system.remove(COLLECTIONS.articleRevisions, old.recordId), 'Pruning old versions')
    }

    return { saved: true as const, revisionId: created.data.recordId, number: revision.number }
  },
)

/**
 * Restores a saved version's title and summary (editor or owner), and
 * returns its body. The live body is a collaborative Yjs document the server
 * cannot write as rich text, so the editor applies the returned content and
 * then saves it as a new version (ADR-017).
 */
export const restoreRevision = mythosAction(
  'restoreRevision',
  revisionIdSchema,
  async ({ userId, params, tools, system }) => {
    const { record: revision } = await requireOwned<ArticleRevisionData>(
      tools,
      userId,
      COLLECTIONS.articleRevisions,
      params.revisionId,
      'editor',
      'Version',
    )
    const { article } = await requireArticle(tools, userId, revision.data.articleId, 'editor')

    const patch: Partial<ArticleData> = { summary: revision.data.summary }
    if (revision.data.title !== article.data.title) {
      const others = await queryAll<Pick<ArticleData, 'slug'>>(tools, COLLECTIONS.articles, {
        where: { universeId: article.data.universeId },
      })
      patch.title = revision.data.title
      patch.slug = uniqueSlug(
        slugify(revision.data.title),
        new Set(others.filter((a) => a.recordId !== article.recordId).map((a) => a.data.slug)),
      )
    }
    await mustSucceed(system.update(COLLECTIONS.articles, article.recordId, patch), 'Restoring the version')
    return {
      articleId: article.recordId,
      number: revision.data.number,
      content: revision.data.content,
    }
  },
)
