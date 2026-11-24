/**
 * Public universes (ADR-024) against the real worker and RecordRoom.
 *
 *   Alice — owner of universe P   Bob — outsider   Carol — invited (pending) to P
 *
 * Covers: private universes stay invisible; making one public lists it on
 * Explore and shows non-members only published articles (no drafts, draft
 * categories, draft connections or unsaved edits); joining as a viewer;
 * a pending invitation blocks self-join; and going private again.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { caller, userIdOf, type ActionResult } from './helpers/mythos'

const NAMES = ['Alice', 'Bob', 'Carol']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(!NAMES.every((n) => available.has(n)), `Needs usable test accounts named ${NAMES.join(', ')}.`)
test.setTimeout(300_000)

const ok = (r: ActionResult) => {
  expect(r.error, 'unexpected refusal').toBeUndefined()
  expect(r.success).toBe(true)
  return r.data as Record<string, unknown>
}
const refused = (r: ActionResult, message: RegExp) => {
  expect(r.success, `expected a refusal matching ${message}`).toBe(false)
  expect(r.error).toMatch(message)
}
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const notFound = /not found/

test('public universes: explore, read published only, join, go private', async ({ users }) => {
  const [alice, bob, carol] = await users(NAMES)
  const [asAlice, asBob, asCarol] = await Promise.all([alice, bob, carol].map(caller))
  const bobId = await userIdOf(bob.page)
  const stamp = Date.now()
  const name = `Open Atlas ${stamp}`
  const P = ok(await asAlice('createUniverse', { name, tagline: `Tagline ${stamp}` })).universeId as string
  const listed = async (as: typeof asBob) =>
    ((ok(await as('listPublicUniverses', { query: `${stamp}` })).universes as Array<{ id: string; myRole: string | null }>) ?? []).find(
      (u) => u.id === P,
    )

  try {
    const pub = ok(await asAlice('createArticle', { universeId: P, title: 'Harbor Town', type: 'location' })).articleId as string
    const draft = ok(await asAlice('createArticle', { universeId: P, title: 'Secret Plot', type: 'lore' })).articleId as string
    const other = ok(await asAlice('createArticle', { universeId: P, title: 'Lighthouse', type: 'location' })).articleId as string
    const secretCategory = ok(await asAlice('createCategory', { universeId: P, name: 'Spoilers' })).categoryId as string
    const save = (articleId: string, title: string, status: 'draft' | 'published', text: string, extra: object = {}) =>
      asAlice('saveArticle', {
        articleId,
        title,
        type: 'location',
        summary: `${title} summary`,
        status,
        categoryId: '',
        tags: [],
        coverImageKey: '',
        content: doc(text),
        ...extra,
      })
    ok(await save(pub, 'Harbor Town', 'published', 'The harbor never sleeps.', { tags: ['coast'] }))
    ok(await save(other, 'Lighthouse', 'published', 'A lamp on the rocks.'))
    ok(await save(draft, 'Secret Plot', 'draft', 'The twist.', { type: 'lore', categoryId: secretCategory }))
    ok(await asAlice('createLink', { fromArticleId: pub, toArticleId: other, type: 'related_to' }))
    ok(await asAlice('createLink', { fromArticleId: pub, toArticleId: draft, type: 'related_to' }))

    await test.step('a private universe is invisible to outsiders', async () => {
      expect(await listed(asBob)).toBeUndefined()
      refused(await asBob('getPublicUniverse', { universeId: P }), notFound)
      refused(await asBob('getPublicArticle', { universeId: P, articleId: pub }), notFound)
      refused(await asBob('joinPublicUniverse', { universeId: P }), notFound)
      // Only the owner can change visibility.
      refused(await asBob('updateUniverse', { universeId: P, visibility: 'public' }), notFound)
      refused(await asAlice('updateUniverse', { universeId: P, visibility: 'everyone' }), /Invalid|option/i)
    })

    await test.step('once public, outsiders read published articles only', async () => {
      ok(await asAlice('updateUniverse', { universeId: P, visibility: 'public' }))
      expect(await listed(asBob)).toMatchObject({ id: P, myRole: null })
      expect(await listed(asAlice)).toMatchObject({ myRole: 'owner' })

      const home = ok(await asBob('getPublicUniverse', { universeId: P }))
      const titles = (home.articles as Array<{ title: string }>).map((a) => a.title).sort()
      expect(titles).toEqual(['Harbor Town', 'Lighthouse'])
      // The only category holds a draft, so it is not revealed.
      expect(home.categories).toEqual([])
      expect(JSON.stringify(home)).not.toContain('Secret Plot')

      const page = ok(await asBob('getPublicArticle', { universeId: P, articleId: pub }))
      const article = page.article as { title: string; tags: string[]; content: unknown }
      expect(article.title).toBe('Harbor Town')
      expect(article.tags).toEqual(['coast'])
      expect(JSON.stringify(article.content)).toContain('The harbor never sleeps.')
      // The link to the draft is hidden; the link between published articles shows.
      expect((page.related as Array<{ title: string }>).map((a) => a.title)).toEqual(['Lighthouse'])
      expect(page.connections as unknown[]).toHaveLength(1)
      expect(JSON.stringify(page)).not.toContain('Secret Plot')

      refused(await asBob('getPublicArticle', { universeId: P, articleId: draft }), notFound)
      // Still not a member: the members-only actions refuse.
      refused(await asBob('createArticle', { universeId: P, title: 'Graffiti', type: 'lore' }), notFound)
    })

    await test.step('outsiders can join as viewer; a pending invitation must be accepted instead', async () => {
      ok(await asAlice('inviteMember', { universeId: P, email: carol.email, role: 'editor' }))
      refused(await asCarol('joinPublicUniverse', { universeId: P }), /invitation/)

      expect(ok(await asBob('joinPublicUniverse', { universeId: P }))).toMatchObject({ role: 'viewer', joined: true })
      // Joining again is harmless and keeps the role.
      expect(ok(await asBob('joinPublicUniverse', { universeId: P }))).toMatchObject({ role: 'viewer', joined: false })
      expect(await listed(asBob)).toMatchObject({ myRole: 'viewer' })
      // A viewer, not an editor.
      refused(await asBob('createArticle', { universeId: P, title: 'Graffiti', type: 'lore' }), /editor access/)
    })

    await test.step('going private hides it from non-members again', async () => {
      ok(await asAlice('updateUniverse', { universeId: P, visibility: 'private' }))
      expect(await listed(asCarol)).toBeUndefined()
      refused(await asCarol('getPublicUniverse', { universeId: P }), notFound)
      // Bob joined, so he is a member and keeps reading.
      ok(await asBob('getPublicUniverse', { universeId: P }))
    })

    await test.step('the UI: Explore lists it, the public page reads it, joining opens the universe', async () => {
      ok(await asAlice('updateUniverse', { universeId: P, visibility: 'public' }))
      // Bob leaves, so he is an outsider again.
      ok(await asBob('removeMember', { universeId: P, userId: bobId }))

      const page = bob.page
      await page.goto('/explore')
      await page.getByTestId('explore-search').fill(`${stamp}`)
      await page.getByTestId('public-universe-card').filter({ hasText: name }).click()
      await expect(page.getByTestId('public-universe-name')).toHaveText(name)
      await expect(page.getByTestId('public-article-card')).toHaveCount(2)
      await page.getByTestId('public-article-card').filter({ hasText: 'Harbor Town' }).click()
      await expect(page.getByTestId('article-body-view')).toContainText('The harbor never sleeps.')

      // A non-member opening the members' URL lands on the public view.
      await page.goto(`/u/${P}`)
      await expect(page).toHaveURL(new RegExp(`/p/${P}$`))
      await page.getByTestId('join-universe').click()
      await expect(page).toHaveURL(new RegExp(`/u/${P}$`))
    })
  } finally {
    await asAlice('deleteUniverse', { universeId: P, confirmName: name })
  }
})
