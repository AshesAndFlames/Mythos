/**
 * Erasing an article's collaborative body before the article row is deleted.
 *
 * Why: record-bound Yjs documents live in the RecordRoom's `yjs_docs` table,
 * keyed `articles:<id>:<field>`, and the SDK never deletes them. Once the row
 * is gone, new joins are refused — but a browser that joined BEFORE the
 * deletion keeps its subscription and can still request the stored state.
 * Emptying the text first leaves nothing to send: Yjs (gc on, the default)
 * drops deleted content when it encodes the stored state.
 *
 * Order (ADR-018):
 *  1. Empty `editorIds`, so editors' live updates are refused while we erase.
 *  2. Replace each body field's text with '' (as the system identity), then
 *     read it back and refuse to continue unless it is empty.
 *  3. Only then may the caller delete the row.
 * If anything fails, the editor list is restored and the deletion is refused,
 * so an article is never deleted with its body intact.
 */

import type { ActionTools } from 'deepspace/worker'
import type { YjsTextTools } from '../action-tools'
import { COLLECTIONS } from '../../domain/mythos'
import { currentEditorIds, fanOutEditorIds } from './membership'

/** Every record-bound Yjs field an article has. Add new ones here. */
export const ARTICLE_YJS_FIELDS = ['body'] as const

/** Erases one article's Yjs fields and verifies they read back empty. */
export async function eraseArticleBody(yjs: YjsTextTools, articleId: string): Promise<void> {
  for (const field of ARTICLE_YJS_FIELDS) {
    const cleared = await yjs.setText(COLLECTIONS.articles, articleId, field, '')
    if (!cleared.success) throw new Error(`Erasing ${field} of ${articleId} failed: ${cleared.error}`)
    const check = await yjs.getText(COLLECTIONS.articles, articleId, field)
    if (!check.success) throw new Error(`Verifying ${field} of ${articleId} failed: ${check.error}`)
    if (check.data.text !== '') throw new Error(`${field} of ${articleId} still has content after erasing`)
  }
}

/**
 * Locks the given articles against live edits, erases their bodies, and
 * restores the universe's editor list if erasing fails. On success the
 * articles stay locked; the caller deletes them next.
 */
export async function lockAndEraseArticles(
  system: ActionTools,
  yjs: YjsTextTools,
  universeId: string,
  articleIds: string[],
): Promise<void> {
  try {
    for (const id of articleIds) {
      const res = await system.update(COLLECTIONS.articles, id, { editorIds: [] })
      if (!res.success) throw new Error(`Locking article ${id} failed: ${res.error}`)
    }
    for (const id of articleIds) await eraseArticleBody(yjs, id)
  } catch (err) {
    // Unlock again; content may be partly erased, but nothing was deleted.
    await fanOutEditorIds(system, universeId, await currentEditorIds(system, universeId))
    throw err
  }
}
