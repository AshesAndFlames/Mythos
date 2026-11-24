/**
 * Backend authorization against the real worker and RecordRoom.
 *
 * Four accounts: Alice owns universe A (seeded), Bob edits it, Carol views
 * it, and Dave owns an unrelated universe B. Every request here is a real
 * POST /api/actions/:name with that user's JWT; the point is to try what the
 * UI would never send — ids from the other universe, roles that are too low,
 * malformed content — and see the server refuse it.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { addMember, caller, hexOf, storedDocHex, typeBody, type ActionResult } from './helpers/mythos'

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(!NAMES.every((n) => available.has(n)), `Needs usable test accounts named ${NAMES.join(', ')}.`)
test.setTimeout(240_000)

type Result = ActionResult

const ok = (r: Result) => {
  expect(r.error, 'unexpected refusal').toBeUndefined()
  expect(r.success).toBe(true)
  return r.data as Record<string, unknown>
}
const refused = (r: Result, message: RegExp) => {
  expect(r.success).toBe(false)
  expect(r.error).toMatch(message)
}
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

test('backend enforces universe boundaries and roles', async ({ users }) => {
  const [alice, bob, carol, dave] = await users(NAMES)
  const [asAlice, asBob, asCarol, asDave] = await Promise.all([alice, bob, carol, dave].map(caller))

  // ── Universe A: seeded by Alice, shared with Bob (editor) and Carol (viewer)
  const seeded = ok(await asAlice('seedExampleUniverse', {}))
  const A = seeded.universeId as string
  const articles = seeded.articleIds as Record<string, string>
  const categories = seeded.categoryIds as Record<string, string>
  await addMember(asAlice, asBob, A, bob.email, 'editor')
  await addMember(asAlice, asCarol, A, carol.email, 'viewer')

  // ── Universe B: Dave's own, with an article, a category and a tag
  const bName = `Dave's world ${Date.now()}`
  const B = ok(await asDave('createUniverse', { name: bName })).universeId as string
  const bArticle = ok(await asDave('createArticle', { universeId: B, title: 'Secret', type: 'lore' }))
    .articleId as string
  const bCategory = ok(await asDave('createCategory', { universeId: B, name: 'Hidden' })).categoryId as string
  const bTag = (ok(await asDave('setArticleTags', { articleId: bArticle, tags: ['classified'] })).tagIds as string[])[0]

  await test.step('editor works normally inside their universe', async () => {
    const link = ok(
      await asBob('createLink', { fromArticleId: articles.silverhold, toArticleId: articles.sundering, type: 'related_to' }),
    )
    expect(link.linkId).toBeTruthy()
    refused(
      await asBob('createLink', { fromArticleId: articles.silverhold, toArticleId: articles.sundering, type: 'related_to' }),
      /already exists/,
    )
    const tags = ok(await asBob('setArticleTags', { articleId: articles.aria, tags: ['Knight', 'knight', 'Hero'] }))
    expect(tags.tagIds).toHaveLength(2)
    ok(await asBob('setArticleCategory', { articleId: articles.aria, categoryId: categories.History }))
    ok(await asBob('setArticleInfobox', { articleId: articles.aria, infobox: [{ key: 'Born', value: 'Northern Marches' }] }))
    refused(
      await asBob('setArticleInfobox', {
        articleId: articles.aria,
        infobox: Array.from({ length: 31 }, (_, i) => ({ key: `k${i}`, value: 'v' })),
      }),
      /infobox/i,
    )
    const sub = ok(await asBob('createCategory', { universeId: A, name: 'Knights', parentId: categories.People }))
    expect(sub.categoryId).toBeTruthy()
  })

  await test.step('manipulated ids cannot cross universes', async () => {
    // A → B link target, and B as a link source for a non-member.
    refused(await asBob('createLink', { fromArticleId: articles.aria, toArticleId: bArticle, type: 'lives_in' }), /not found/)
    refused(await asBob('createLink', { fromArticleId: bArticle, toArticleId: articles.aria, type: 'lives_in' }), /not found/)
    // Universe B's category on a universe A article, and as a parent.
    refused(await asBob('setArticleCategory', { articleId: articles.aria, categoryId: bCategory }), /not found/)
    refused(await asBob('updateCategory', { categoryId: categories.People, parentId: bCategory }), /not found/)
    refused(await asBob('createCategory', { universeId: A, name: 'Sneaky', parentId: bCategory }), /not found/)
    // Universe B rows addressed directly by a non-member.
    refused(await asBob('deleteTag', { tagId: bTag }), /not found/)
    refused(await asBob('deleteCategory', { categoryId: bCategory }), /not found/)
    refused(await asBob('renameArticle', { articleId: bArticle, title: 'Mine' }), /not found/)
    refused(await asBob('saveRevision', { articleId: bArticle, content: doc('x') }), /not found/)
    // Dave against universe A.
    refused(await asDave('setArticleTags', { articleId: articles.aria, tags: ['vandal'] }), /not found/)
    refused(await asDave('createArticle', { universeId: A, title: 'Forged', type: 'lore' }), /not found/)
    refused(await asDave('updateUniverse', { universeId: A, name: 'Taken' }), /not found/)
    refused(await asDave('deleteUniverse', { universeId: A, confirmName: 'The Shattered Realms' }), /not found/)
  })

  await test.step('viewer cannot modify content', async () => {
    const editorOnly = /editor access/
    refused(await asCarol('createArticle', { universeId: A, title: 'Nope', type: 'lore' }), editorOnly)
    refused(await asCarol('renameArticle', { articleId: articles.aria, title: 'Nope' }), editorOnly)
    refused(await asCarol('deleteArticle', { articleId: articles.aria }), editorOnly)
    refused(await asCarol('createLink', { fromArticleId: articles.aria, toArticleId: articles.order, type: 'ally_of' }), editorOnly)
    refused(await asCarol('setArticleTags', { articleId: articles.aria, tags: ['x'] }), editorOnly)
    refused(await asCarol('setArticleCategory', { articleId: articles.aria, categoryId: '' }), editorOnly)
    refused(await asCarol('createCategory', { universeId: A, name: 'Nope' }), editorOnly)
    refused(await asCarol('setArticleInfobox', { articleId: articles.aria, infobox: [] }), editorOnly)
    refused(await asCarol('saveRevision', { articleId: articles.aria, content: doc('x') }), editorOnly)
  })

  await test.step('only the owner manages the universe and its members', async () => {
    const ownerOnly = /owner/
    refused(await asBob('updateUniverse', { universeId: A, name: 'Renamed' }), ownerOnly)
    refused(await asBob('deleteUniverse', { universeId: A, confirmName: 'The Shattered Realms' }), ownerOnly)
    refused(await asBob('inviteMember', { universeId: A, email: dave.email, role: 'editor' }), ownerOnly)
    refused(await asCarol('setMemberRole', { universeId: A, userId: 'anyone', role: 'editor' }), ownerOnly)

    const renamed = ok(await asAlice('updateUniverse', { universeId: A, name: 'The Shattered Realms II' }))
    // `-n` when an earlier, interrupted run left a seeded universe behind.
    expect(renamed.slug).toMatch(/^the-shattered-realms-ii(-\d+)?$/)
    // Only 'private' and 'public' exist (ADR-024).
    refused(await asAlice('updateUniverse', { universeId: A, visibility: 'unlisted' }), /visibility|Invalid|option/i)
    refused(await asAlice('deleteUniverse', { universeId: A, confirmName: 'wrong' }), /exactly/)
  })

  await test.step('revisions keep meaningful changes only', async () => {
    const first = ok(await asBob('saveRevision', { articleId: articles.aria, content: doc('Version one') }))
    expect(first.saved).toBe(true)
    const again = ok(await asBob('saveRevision', { articleId: articles.aria, content: doc('Version one') }))
    expect(again.saved).toBe(false)
    const second = ok(await asBob('saveRevision', { articleId: articles.aria, content: doc('Version two') }))
    expect(second.number).toBe((first.number as number) + 1)

    refused(
      await asBob('saveRevision', {
        articleId: articles.aria,
        content: { type: 'doc', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
      }),
      /http/,
    )
    refused(await asBob('saveRevision', { articleId: articles.aria, content: '<p>html</p>' }), /.+/)

    const restored = ok(await asBob('restoreRevision', { revisionId: first.revisionId }))
    expect(restored.content).toEqual(doc('Version one'))
    refused(await asDave('restoreRevision', { revisionId: first.revisionId }), /not found/)
    refused(await asCarol('restoreRevision', { revisionId: first.revisionId }), /editor access/)
  })

  await test.step('removing a member revokes their access', async () => {
    await alice.page.goto(`/u/${A}/members`)
    const members = alice.page.getByTestId('member-row')
    await expect(members).toHaveCount(3, { timeout: 20_000 })
    await members.filter({ hasText: 'Carol' }).getByRole('button', { name: 'Remove' }).click()
    await alice.page.getByRole('button', { name: 'Remove member' }).click()
    await expect(members).toHaveCount(2, { timeout: 20_000 })
    refused(await asCarol('restoreRevision', { revisionId: 'x' }), /not found/)
    refused(await asCarol('renameArticle', { articleId: articles.aria, title: 'x' }), /not found/)
  })

  await test.step('deleting an article erases its stored body', async () => {
    const secret = `Marches secret ${Date.now()}`
    await typeBody(bob, A, articles.marches, secret)
    // Alice keeps the article open, so a live subscription exists during the delete.
    await alice.page.goto(`/u/${A}/a/${articles.marches}`)
    await expect(alice.page.getByTestId('article-body-view')).toContainText(secret, { timeout: 20_000 })

    ok(await asBob('deleteArticle', { articleId: articles.marches }))
    const stored = await storedDocHex(bob.page.request, `articles:${articles.marches}:body`)
    expect(stored === null || !stored.includes(hexOf(secret))).toBe(true)
    expect(stored === null || !stored.includes(hexOf('Marches secret'))).toBe(true)
    await expect(alice.page.getByRole('heading', { name: 'Article not found' })).toBeVisible({ timeout: 20_000 })
  })

  await test.step('new articles get fresh UUIDs', async () => {
    const created = ok(await asBob('createArticle', { universeId: A, title: 'Fresh', type: 'lore' }))
    expect(created.articleId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  await test.step('deletes cascade and leave no reachable rows', async () => {
    const universeSecret = `Silverhold secret ${Date.now()}`
    await typeBody(bob, A, articles.silverhold, universeSecret)

    const rev = ok(await asBob('saveRevision', { articleId: articles.order, content: doc('Founding') }))
    ok(await asBob('deleteArticle', { articleId: articles.order }))
    refused(await asBob('restoreRevision', { revisionId: rev.revisionId }), /not found/)
    refused(await asBob('createLink', { fromArticleId: articles.aria, toArticleId: articles.order, type: 'member_of' }), /not found/)

    ok(await asBob('deleteCategory', { categoryId: categories.People }))
    ok(await asDave('deleteUniverse', { universeId: B, confirmName: bName }))
    refused(await asDave('createArticle', { universeId: B, title: 'Gone', type: 'lore' }), /not found/)
    refused(await asDave('renameArticle', { articleId: bArticle, title: 'Gone' }), /not found/)

    ok(await asAlice('deleteUniverse', { universeId: A, confirmName: 'The Shattered Realms II' }))
    refused(await asBob('renameArticle', { articleId: articles.aria, title: 'Gone' }), /not found/)
    // Deleting the universe erased every article body, not just the rows.
    const stored = await storedDocHex(bob.page.request, `articles:${articles.silverhold}:body`)
    expect(stored === null || !stored.includes(hexOf(universeSecret))).toBe(true)
  })
})
