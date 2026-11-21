/**
 * The knowledge graph against the real worker and RecordRoom.
 *
 *   Alice — owner of universe A   Bob — editor   Carol — viewer
 *   Dave  — outsider, owner of universe B
 *
 * Covers relationship creation (and its integrity rules), retrieval through
 * the Connections section, authorization, and deletion (live, by action and
 * through the UI, and by cascade).
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { caller, type ActionResult } from './helpers/mythos'

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(!NAMES.every((n) => available.has(n)), `Needs usable test accounts named ${NAMES.join(', ')}.`)
test.setTimeout(240_000)

const ok = (r: ActionResult) => {
  expect(r.error, 'unexpected refusal').toBeUndefined()
  expect(r.success).toBe(true)
  return r.data as Record<string, string>
}
const refused = (r: ActionResult, message: RegExp) => {
  expect(r.success).toBe(false)
  expect(r.error).toMatch(message)
}

test('relationships: creation, retrieval, authorization and deletion', async ({ users }) => {
  const [alice, bob, carol, dave] = await users(NAMES)
  const [asAlice, asBob, asCarol, asDave] = await Promise.all([alice, bob, carol, dave].map(caller))
  const stamp = Date.now()
  const aName = `Graph ${stamp}`
  const bName = `Elsewhere ${stamp}`
  const A = ok(await asAlice('createUniverse', { name: aName })).universeId
  const B = ok(await asDave('createUniverse', { name: bName })).universeId

  try {
    ok(await asAlice('inviteMember', { universeId: A, email: bob.email, role: 'editor' }))
    ok(await asAlice('inviteMember', { universeId: A, email: carol.email, role: 'viewer' }))

    const art: Record<string, string> = {}
    for (const [key, title, type] of [
      ['aria', 'Aria', 'character'],
      ['citadel', 'Silver Citadel', 'location'],
      ['order', 'Order of Embers', 'faction'],
      ['war', 'The Great War', 'event'],
      ['aldric', 'King Aldric', 'character'],
      ['wen', 'Grandmother Wen', 'character'],
      ['ilse', 'Mother Ilse', 'character'],
    ] as const) {
      art[key] = ok(await asBob('createArticle', { universeId: A, title, type })).articleId
    }
    const foreign = ok(await asDave('createArticle', { universeId: B, title: 'Far Shore', type: 'location' })).articleId
    const link = (from: string, type: string, to: string) => ({ fromArticleId: art[from], toArticleId: art[to], type })

    const ids: Record<string, string> = {}
    await test.step('editors create relationships', async () => {
      ids.livesIn = ok(await asBob('createLink', { ...link('aria', 'lives_in', 'citadel'), note: 'Since the siege' })).linkId
      ids.memberOf = ok(await asBob('createLink', link('aria', 'member_of', 'order'))).linkId
      ids.war = ok(await asAlice('createLink', link('aria', 'participated_in', 'war'))).linkId
      ids.related = ok(await asBob('createLink', link('aldric', 'related_to', 'aria'))).linkId
      ok(await asBob('createLink', link('wen', 'parent_of', 'ilse')))
      ok(await asBob('createLink', link('ilse', 'parent_of', 'aria')))
    })

    await test.step('integrity: no self links, duplicates or loops', async () => {
      refused(await asBob('createLink', link('aria', 'lives_in', 'aria')), /itself/)
      refused(await asBob('createLink', link('aria', 'lives_in', 'citadel')), /already exists/)
      // A symmetric relationship is the same link either way round.
      refused(await asBob('createLink', link('aria', 'related_to', 'aldric')), /already exists/)
      refused(await asBob('createLink', link('aria', 'parent_of', 'wen')), /own ancestor/)
      refused(await asBob('createLink', link('aria', 'lives_in', 'nope')), /Invalid|not found/i)
      // Concurrent identical requests: exactly one link is stored.
      const racing = await Promise.all([1, 2, 3].map(() => asBob('createLink', link('aldric', 'ally_of', 'citadel'))))
      expect(racing.filter((r) => r.success)).toHaveLength(1)
      for (const r of racing.filter((x) => !x.success)) expect(r.error).toMatch(/already exists/)
    })

    await test.step('authorization: viewers, outsiders and other universes are refused', async () => {
      refused(await asCarol('createLink', link('aria', 'enemy_of', 'aldric')), /editor access/)
      refused(await asDave('createLink', link('aria', 'enemy_of', 'aldric')), /not found/)
      refused(await asBob('createLink', { fromArticleId: art.aria, toArticleId: foreign, type: 'lives_in' }), /not found/)
      refused(await asDave('createLink', { fromArticleId: foreign, toArticleId: art.aria, type: 'lives_in' }), /not found/)
      refused(await asCarol('deleteLink', { linkId: ids.livesIn }), /editor access/)
      refused(await asDave('deleteLink', { linkId: ids.livesIn }), /not found/)
    })

    await test.step('retrieval: a viewer reads grouped connections and follows them', async () => {
      const page = carol.page
      await page.goto(`/u/${A}/a/${art.aria}`)
      const connections = page.getByTestId('connections')
      await expect(connections.getByRole('heading', { name: 'Connections' })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('connections-count')).toHaveText('5 connections · 3 from here · 1 pointing here · 1 mutual')
      const group = (key: string) => connections.locator(`[data-group="${key}"]`)
      await expect(group('lives_in:outgoing')).toContainText('Lives in')
      await expect(group('lives_in:outgoing')).toContainText('Silver Citadel')
      await expect(group('lives_in:outgoing')).toContainText('Location')
      await expect(group('lives_in:outgoing')).toContainText('Since the siege')
      await expect(group('member_of:outgoing')).toContainText('Order of Embers')
      await expect(group('participated_in:outgoing')).toContainText('The Great War')
      await expect(group('related_to:mutual')).toContainText('King Aldric')
      await expect(group('parent_of:incoming')).toContainText('Child of')
      await expect(group('parent_of:incoming')).toContainText('Mother Ilse')
      // Viewers get no remove controls.
      await expect(page.getByRole('button', { name: /Remove connection/ })).toHaveCount(0)

      await connections.getByRole('link', { name: 'Silver Citadel' }).click()
      await expect(page.getByTestId('article-title')).toHaveText('Silver Citadel', { timeout: 20_000 })
      await expect(page.getByTestId('connections').locator('[data-group="lives_in:incoming"]')).toContainText('Home of')
      await expect(page.getByTestId('connections').locator('[data-group="lives_in:incoming"]')).toContainText('Aria')

      // An outsider cannot reach the article or its connections.
      await dave.page.goto(`/u/${A}/a/${art.aria}`)
      await expect(dave.page.getByRole('heading', { name: 'Universe not found' })).toBeVisible({ timeout: 20_000 })
      await expect(dave.page.getByTestId('connections')).toHaveCount(0)
    })

    await test.step('deletion: by action and through the UI, seen live by readers', async () => {
      await carol.page.goto(`/u/${A}/a/${art.aria}`)
      const carolGroup = (key: string) => carol.page.getByTestId('connections').locator(`[data-group="${key}"]`)
      await expect(carolGroup('member_of:outgoing')).toBeVisible({ timeout: 20_000 })

      ok(await asBob('deleteLink', { linkId: ids.memberOf }))
      await expect(carolGroup('member_of:outgoing')).toHaveCount(0, { timeout: 20_000 })
      refused(await asBob('deleteLink', { linkId: ids.memberOf }), /not found/)

      const page = alice.page
      await page.goto(`/u/${A}/a/${art.aria}`)
      await page.getByRole('button', { name: 'Remove connection: participated in The Great War' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
      await expect(page.getByTestId('connections').locator('[data-group="participated_in:outgoing"]')).toHaveCount(0, {
        timeout: 20_000,
      })
      await expect(carolGroup('participated_in:outgoing')).toHaveCount(0, { timeout: 20_000 })
    })

    await test.step('an editor adds a connection from the target end in the editor', async () => {
      const page = bob.page
      await page.goto(`/u/${A}/a/${art.citadel}/edit`)
      await page.getByLabel('Relationship type').selectOption('lives_in:incoming')
      await page.getByLabel('Find an article to link').fill('Aria')
      // Aria already lives in the citadel: offered, but marked and disabled.
      const results = page.getByRole('list', { name: 'Matching articles' })
      await expect(results.getByRole('button', { name: /Aria.*already linked/ })).toBeDisabled()
      await page.getByLabel('Find an article to link').fill('Aldric')
      await results.getByRole('button', { name: /King Aldric/ }).click()
      await page.getByRole('button', { name: 'Add connection' }).click()
      await expect(page.getByTestId('connections').locator('[data-group="lives_in:incoming"]')).toContainText('King Aldric', {
        timeout: 20_000,
      })
      await page.goto(`/u/${A}/a/${art.aldric}`)
      await expect(page.getByTestId('connections').locator('[data-group="lives_in:outgoing"]')).toContainText('Silver Citadel', {
        timeout: 20_000,
      })
    })

    await test.step('deleting an article removes its relationships', async () => {
      ok(await asBob('deleteArticle', { articleId: art.aldric }))
      await bob.page.goto(`/u/${A}/a/${art.citadel}`)
      const homeOf = bob.page.getByTestId('connections').locator('[data-group="lives_in:incoming"]')
      await expect(homeOf).toContainText('Aria', { timeout: 20_000 })
      await expect(homeOf).not.toContainText('King Aldric')
      refused(await asBob('deleteLink', { linkId: ids.related }), /not found/)
    })
  } finally {
    await asAlice('deleteUniverse', { universeId: A, confirmName: aName })
    await asDave('deleteUniverse', { universeId: B, confirmName: bName })
  }
})
