/**
 * Collaborative membership against the real worker and RecordRoom.
 *
 *   Alice — owner of universe A   Bob — invited as editor   Carol — invited as viewer
 *   Dave  — outsider (owns universe B; invited to A once, and declines)
 *
 * Covers invitations (invite, update, revoke, accept, decline, and who may
 * answer one), what each role may and may not do — checked on the server,
 * not through hidden buttons — and the activity feed.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { caller, openDashboard, userIdOf, type ActionResult } from './helpers/mythos'

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave']
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
const mask = (email: string) => {
  const e = email.toLowerCase()
  return `${e.charAt(0)}•••${e.slice(e.lastIndexOf('@'))}`
}
const ownerOnly = /owner/
const editorOnly = /editor access/
const notFound = /not found/

test('membership: invitations, roles and activity', async ({ users }) => {
  const [alice, bob, carol, dave] = await users(NAMES)
  const [asAlice, asBob, asCarol, asDave] = await Promise.all([alice, bob, carol, dave].map(caller))
  const [bobId, carolId] = await Promise.all([userIdOf(bob.page), userIdOf(carol.page)])
  const stamp = Date.now()
  const aName = `Fellowship ${stamp}`
  const bName = `Solitude ${stamp}`
  const stranger = `nobody-${stamp}@example.com`
  const A = ok(await asAlice('createUniverse', { name: aName })).universeId as string
  const B = ok(await asDave('createUniverse', { name: bName })).universeId as string
  const invitationOf = async (as: typeof asBob) =>
    ((ok(await as('myInvitations', {})).invitations as Array<{ invitationId: string; universeId: string; role: string }>) ?? []).find(
      (i) => i.universeId === A,
    )

  try {
    await test.step('the owner invites by email; nothing changes until the invitee accepts', async () => {
      // Test accounts and example.com addresses are never emailed (no real mail, no spend).
      expect(ok(await asAlice('inviteMember', { universeId: A, email: bob.email, role: 'viewer' })).emailStatus).toBe('skipped')
      // Inviting the same address again updates the pending invitation.
      expect(ok(await asAlice('inviteMember', { universeId: A, email: bob.email.toUpperCase(), role: 'editor' })).updated).toBe(true)
      ok(await asAlice('inviteMember', { universeId: A, email: carol.email, role: 'viewer' }))
      // No account is needed to be invited.
      expect(ok(await asAlice('inviteMember', { universeId: A, email: stranger, role: 'editor' })).emailStatus).toBe('skipped')
      refused(await asAlice('inviteMember', { universeId: A, email: alice.email, role: 'editor' }), /already a member/)
      refused(await asAlice('inviteMember', { universeId: A, email: 'not-an-email', role: 'editor' }), /valid email/)
      refused(await asAlice('inviteMember', { universeId: A, email: stranger, role: 'owner' }), /Invalid|option/i)

      const pending = ok(await asAlice('listInvitations', { universeId: A })).invitations as Array<{ email: string; role: string }>
      expect(pending.map((p) => `${p.email}:${p.role}`).sort()).toEqual(
        [`${bob.email.toLowerCase()}:editor`, `${carol.email.toLowerCase()}:viewer`, `${stranger}:editor`].sort(),
      )

      // Invited is not a member: Bob still cannot see or write anything.
      refused(await asBob('createArticle', { universeId: A, title: 'Too soon', type: 'lore' }), notFound)
      refused(await asBob('listInvitations', { universeId: A }), notFound)
    })

    await test.step('only the invitee can answer an invitation', async () => {
      const bobs = await invitationOf(asBob)
      expect(bobs?.role).toBe('editor')
      expect(await invitationOf(asDave)).toBeUndefined()
      refused(await asDave('respondToInvitation', { invitationId: bobs?.invitationId, accept: true }), /Invitation not found/)
      refused(await asCarol('respondToInvitation', { invitationId: bobs?.invitationId, accept: true }), /Invitation not found/)
      refused(await asDave('revokeInvitation', { invitationId: bobs?.invitationId }), /Invitation not found/)
      refused(await asBob('revokeInvitation', { invitationId: bobs?.invitationId }), /Invitation not found/)
    })

    await test.step('the owner revokes an invitation', async () => {
      await alice.page.goto(`/u/${A}/members`)
      const row = alice.page.getByTestId('pending-invitation').filter({ hasText: stranger })
      await row.getByRole('button', { name: 'Revoke' }).click()
      await alice.page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
      await expect(alice.page.getByTestId('pending-invitation')).toHaveCount(2, { timeout: 20_000 })
    })

    await test.step('invitees accept (in the UI and by action) and decline', async () => {
      await openDashboard(bob)
      const invite = bob.page.getByTestId('my-invitation').filter({ hasText: aName })
      await expect(invite).toContainText('editor', { timeout: 20_000 })
      await invite.getByRole('button', { name: 'Accept' }).click()
      await expect(bob.page.getByTestId('universe-name')).toHaveText(aName, { timeout: 20_000 })

      const carols = await invitationOf(asCarol)
      expect(ok(await asCarol('respondToInvitation', { invitationId: carols?.invitationId, accept: true })).role).toBe('viewer')
      // An answered invitation cannot be answered (or revoked) again.
      refused(await asCarol('respondToInvitation', { invitationId: carols?.invitationId, accept: true }), /Invitation not found/)
      refused(await asAlice('revokeInvitation', { invitationId: carols?.invitationId }), /already answered/)

      ok(await asAlice('inviteMember', { universeId: A, email: dave.email, role: 'viewer' }))
      await openDashboard(dave)
      const daveInvite = dave.page.getByTestId('my-invitation').filter({ hasText: aName })
      await daveInvite.getByRole('button', { name: 'Decline' }).click()
      await expect(daveInvite).toHaveCount(0, { timeout: 20_000 })
      expect(await invitationOf(asDave)).toBeUndefined()
      await dave.page.goto(`/u/${A}`)
      await expect(dave.page.getByRole('heading', { name: 'Universe not found' })).toBeVisible({ timeout: 20_000 })

      expect(ok(await asAlice('listInvitations', { universeId: A })).invitations).toEqual([])
      await alice.page.goto(`/u/${A}/members`)
      await expect(alice.page.getByTestId('member-row')).toHaveCount(3, { timeout: 20_000 })
    })

    const art: Record<string, string> = {}
    await test.step('owner: full access', async () => {
      ok(await asAlice('updateUniverse', { universeId: A, tagline: 'Bound by oath' }))
      art.citadel = ok(await asAlice('createArticle', { universeId: A, title: 'Silver Citadel', type: 'location' })).articleId as string
      ok(await asAlice('setMemberRole', { universeId: A, userId: carolId, role: 'editor' }))
      ok(await asAlice('setMemberRole', { universeId: A, userId: carolId, role: 'viewer' }))
    })

    await test.step('editor: writes content, cannot manage the universe or its members', async () => {
      art.aria = ok(await asBob('createArticle', { universeId: A, title: 'Aria', type: 'character' })).articleId as string
      const save = (status: 'draft' | 'published', text: string) =>
        asBob('saveArticle', {
          articleId: art.aria,
          title: 'Aria',
          type: 'character',
          summary: 'A knight',
          status,
          categoryId: '',
          tags: [],
          coverImageKey: '',
          content: doc(text),
        })
      ok(await save('draft', 'First draft'))
      ok(await save('draft', 'Second draft'))
      ok(await save('published', 'Final'))
      const link = ok(await asBob('createLink', { fromArticleId: art.aria, toArticleId: art.citadel, type: 'lives_in' })).linkId
      ok(await asBob('deleteLink', { linkId: link }))
      ok(await asBob('createCategory', { universeId: A, name: 'People' }))

      refused(await asBob('updateUniverse', { universeId: A, name: 'Mine' }), ownerOnly)
      refused(await asBob('deleteUniverse', { universeId: A, confirmName: aName }), ownerOnly)
      refused(await asBob('inviteMember', { universeId: A, email: dave.email, role: 'editor' }), ownerOnly)
      refused(await asBob('listInvitations', { universeId: A }), ownerOnly)
      refused(await asBob('setMemberRole', { universeId: A, userId: carolId, role: 'editor' }), ownerOnly)
      refused(await asBob('removeMember', { universeId: A, userId: carolId }), ownerOnly)
    })

    await test.step('viewer: reads only', async () => {
      refused(await asCarol('createArticle', { universeId: A, title: 'Forged', type: 'lore' }), editorOnly)
      refused(await asCarol('renameArticle', { articleId: art.aria, title: 'Forged' }), editorOnly)
      refused(
        await asCarol('saveArticle', {
          articleId: art.aria,
          title: 'Forged',
          type: 'character',
          summary: '',
          status: 'published',
          categoryId: '',
          tags: [],
          coverImageKey: '',
          content: doc('Forged'),
        }),
        editorOnly,
      )
      refused(await asCarol('deleteArticle', { articleId: art.aria }), editorOnly)
      refused(await asCarol('createLink', { fromArticleId: art.aria, toArticleId: art.citadel, type: 'owns' }), editorOnly)
      refused(await asCarol('createCategory', { universeId: A, name: 'Forged' }), editorOnly)
      refused(await asCarol('inviteMember', { universeId: A, email: dave.email, role: 'viewer' }), ownerOnly)
      refused(await asCarol('updateUniverse', { universeId: A, name: 'Forged' }), ownerOnly)

      // The viewer's pages offer no management or writing controls.
      await carol.page.goto(`/u/${A}/members`)
      await expect(carol.page.getByTestId('member-row')).toHaveCount(3, { timeout: 20_000 })
      await expect(carol.page.getByLabel('Invite by email')).toHaveCount(0)
      await expect(carol.page.getByRole('combobox', { name: /Role for/ })).toHaveCount(0)
      await expect(carol.page.locator(`a[href="/u/${A}/settings"]`)).toHaveCount(0)
      await carol.page.goto(`/u/${A}/settings`)
      await expect(carol.page.getByTestId('settings-owner-only')).toBeVisible({ timeout: 20_000 })
      await carol.page.goto(`/u/${A}/a/${art.aria}`)
      await expect(carol.page.getByTestId('article-title')).toHaveText('Aria', { timeout: 20_000 })
      await expect(carol.page.getByTestId('edit-article')).toHaveCount(0)
    })

    await test.step('outsider: nothing, in either direction', async () => {
      refused(await asDave('createArticle', { universeId: A, title: 'Forged', type: 'lore' }), notFound)
      refused(await asDave('renameArticle', { articleId: art.aria, title: 'Forged' }), notFound)
      refused(await asDave('inviteMember', { universeId: A, email: dave.email, role: 'editor' }), notFound)
      refused(await asDave('listInvitations', { universeId: A }), notFound)
      refused(await asDave('removeMember', { universeId: A, userId: bobId }), notFound)
      refused(await asBob('createArticle', { universeId: B, title: 'Forged', type: 'lore' }), notFound)
    })

    await test.step('activity: members see who did what and when', async () => {
      const page = carol.page
      await page.goto(`/u/${A}/activity`)
      const feed = page.getByTestId('activity-feed')
      await expect(feed).toBeVisible({ timeout: 20_000 })
      const entries = (kind: string) => feed.locator(`[data-kind="${kind}"]`)

      // Bob was invited as a viewer, then the invitation was changed to editor: two entries.
      const bobInvites = entries('member_invited').filter({ hasText: mask(bob.email) })
      await expect(bobInvites).toHaveCount(2)
      await expect(bobInvites.filter({ hasText: 'as editor' })).toContainText('Alice invited')
      await expect(bobInvites.filter({ hasText: 'as viewer' })).toContainText('Alice invited')
      // The feed never shows an invitee's full email.
      await expect(feed).not.toContainText(bob.email.toLowerCase())
      await expect(entries('member_joined').filter({ hasText: 'Bob' })).toContainText('joined as editor')
      await expect(entries('member_joined').filter({ hasText: 'Carol' })).toContainText('joined as viewer')
      await expect(entries('article_created').filter({ hasText: 'Silver Citadel' })).toContainText('Alice created')
      await expect(entries('article_created').filter({ hasText: 'Aria' })).toContainText('Bob created')
      // Two draft saves in a row fold into one update; publishing is its own entry.
      await expect(entries('article_updated').filter({ hasText: 'Aria' })).toHaveCount(1)
      await expect(entries('article_published').filter({ hasText: 'Aria' })).toContainText('Bob published')

      const time = entries('article_published').first().locator('time')
      expect(Date.parse((await time.getAttribute('datetime')) as string)).toBeGreaterThan(stamp - 60_000)
      await feed.getByRole('link', { name: 'Aria' }).first().click()
      await expect(page.getByTestId('article-title')).toHaveText('Aria', { timeout: 20_000 })

      await dave.page.goto(`/u/${A}/activity`)
      await expect(dave.page.getByRole('heading', { name: 'Universe not found' })).toBeVisible({ timeout: 20_000 })
    })

    await test.step('a removed member loses access at once', async () => {
      ok(await asAlice('removeMember', { universeId: A, userId: bobId }))
      refused(await asBob('createArticle', { universeId: A, title: 'Late', type: 'lore' }), notFound)
      await bob.page.goto(`/u/${A}/activity`)
      await expect(bob.page.getByRole('heading', { name: 'Universe not found' })).toBeVisible({ timeout: 20_000 })
      // Re-inviting works, and the old invitation does not grant access by itself.
      ok(await asAlice('inviteMember', { universeId: A, email: bob.email, role: 'viewer' }))
      refused(await asBob('createArticle', { universeId: A, title: 'Late', type: 'lore' }), notFound)
    })
  } finally {
    await asAlice('deleteUniverse', { universeId: A, confirmName: aName })
    await asDave('deleteUniverse', { universeId: B, confirmName: bName })
  }
})
