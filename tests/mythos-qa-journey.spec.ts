/**
 * Production-readiness journey (QA_REPORT.md), entirely through the UI:
 *
 *   Alice — owner: creates a universe, edits its details, writes a character
 *           and a location, connects them, edits and publishes, and invites.
 *   Bob   — accepts an editor invitation on his dashboard and edits.
 *   Carol — accepts a viewer invitation and can only read.
 *
 * Role checks are also made against the server (not only hidden buttons).
 * At the end, Bob's browser is narrowed to a phone (390×844) and every main
 * page is checked for horizontal overflow and for controls without an
 * accessible name. Screenshots land in test-results/qa-mobile-*.png.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { caller, openDashboard, replaceEditorText, startUniverse, type ActionResult } from './helpers/mythos'

const NAMES = ['Alice', 'Bob', 'Carol']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(!NAMES.every((n) => available.has(n)), `Needs usable test accounts named ${NAMES.join(', ')}.`)
test.setTimeout(300_000)

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const refused = (r: ActionResult, message: RegExp) => {
  expect(r.success, `expected a refusal matching ${message}`).toBe(false)
  expect(r.error).toMatch(message)
}

/** Controls a screen reader could not name, and whether the page scrolls sideways. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const named = (el: Element) => {
      const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')
      if (aria) return true
      if ((el as HTMLElement).innerText?.trim()) return true
      const id = el.getAttribute('id')
      if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true
      if (el.closest('label')) return true
      if (el.querySelector('img[alt]:not([alt=""])')) return true
      return (el as HTMLInputElement).type === 'hidden'
    }
    const unnamed = [...document.querySelectorAll('button, a[href], input, select, textarea')]
      .filter((el) => (el as HTMLElement).offsetParent !== null || el.getAttribute('type') === 'file')
      // A closed drawer is visibility:hidden — not reachable, so not audited.
      .filter((el) => getComputedStyle(el).visibility !== 'hidden')
      .filter((el) => !named(el))
      .map((el) => el.outerHTML.slice(0, 120))
    return { unnamed, overflow: document.documentElement.scrollWidth - window.innerWidth }
  })
}

test('QA journey: build, connect, publish, invite, accept, roles, mobile', async ({ users }) => {
  const [alice, bob, carol] = await users(NAMES)
  const [asAlice, asBob, asCarol] = await Promise.all([alice, bob, carol].map(caller))
  const page = alice.page
  const stamp = Date.now()
  const name = `QA World ${stamp}`
  const renamed = `QA Realm ${stamp}`
  let universeId = ''

  try {
    await test.step('create a universe', async () => {
      await openDashboard(alice)
      await startUniverse(page)
      await page.getByLabel('Name').fill(name)
      await page.getByRole('button', { name: 'Create universe' }).click()
      await expect(page.getByTestId('universe-name')).toHaveText(name, { timeout: 20_000 })
      universeId = new URL(page.url()).pathname.split('/')[2]
      expect(universeId).toBeTruthy()
    })

    await test.step('edit universe details', async () => {
      await page.goto(`/u/${universeId}/settings`)
      await page.getByLabel('Name').fill(renamed)
      await page.getByLabel('Tagline').fill('Edited by QA')
      await page.getByLabel('Description').fill('A world rewritten during the readiness review.')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Universe updated')).toBeVisible({ timeout: 20_000 })
      await page.goto(`/u/${universeId}`)
      await expect(page.getByTestId('universe-name')).toHaveText(renamed, { timeout: 20_000 })
      await expect(page.getByText('Edited by QA')).toBeVisible()
    })

    const create = async (title: string, type: string) => {
      await page.goto(`/u/${universeId}`)
      await page.getByTestId('new-article-button').or(page.getByRole('button', { name: 'Write the first article' })).first().click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Title').fill(title)
      await dialog.getByLabel('Type', { exact: true }).selectOption(type)
      await dialog.getByRole('button', { name: 'Create article' }).click()
      await expect(page).toHaveURL(/\/edit$/, { timeout: 20_000 })
      return new URL(page.url()).pathname.replace(/\/edit$/, '')
    }

    let kaelUrl = ''
    let emberUrl = ''
    await test.step('create a character and a location', async () => {
      kaelUrl = await create('Kael Ashborne', 'character')
      emberUrl = await create('Emberfall', 'location')
    })

    await test.step('connect the character to the location', async () => {
      await page.goto(`${kaelUrl}/edit`)
      await page.getByLabel('Relationship type').selectOption('lives_in:outgoing')
      await page.getByLabel('Find an article to link').fill('Ember')
      await page.getByRole('list', { name: 'Matching articles' }).getByRole('button', { name: /Emberfall/ }).click()
      await page.getByRole('button', { name: 'Add connection' }).click()
      await expect(page.getByTestId('connections').locator('[data-group="lives_in:outgoing"]')).toContainText('Emberfall', {
        timeout: 20_000,
      })
    })

    await test.step('edit an article and publish it', async () => {
      await page.getByTestId('article-summary-input').fill('A smith who keeps the city fires.')
      await replaceEditorText(page, 'Kael tends the forges of Emberfall.')
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 20_000 })
      await page.getByRole('button', { name: 'Publish' }).click()
      await expect(page).toHaveURL(new RegExp(`${kaelUrl}$`), { timeout: 20_000 })
      await expect(page.getByTestId('article-summary')).toHaveText('A smith who keeps the city fires.')
      await expect(page.getByTestId('article-body-view')).toContainText('forges of Emberfall', { timeout: 20_000 })
      await expect(page.getByText('Published', { exact: true })).toBeVisible()
      // Unpublishing is explicit, and the article can be published again.
      await page.goto(`${kaelUrl}/edit`)
      await page.getByRole('button', { name: 'Unpublish' }).click()
      await expect(page.getByText(/Unpublished — now a draft/)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()
      await page.getByRole('button', { name: 'Publish' }).click()
      await expect(page).toHaveURL(new RegExp(`${kaelUrl}$`), { timeout: 20_000 })
      await expect(page.getByText('Published', { exact: true })).toBeVisible()
      await page.goto(emberUrl)
      await expect(page.getByTestId('connections').locator('[data-group="lives_in:incoming"]')).toContainText('Kael Ashborne', {
        timeout: 20_000,
      })
    })

    await test.step('invite two users', async () => {
      await page.goto(`/u/${universeId}/members`)
      for (const [user, role] of [
        [bob, 'editor'],
        [carol, 'viewer'],
      ] as const) {
        await page.getByLabel('Invite by email').fill(user.email)
        await page.getByLabel('Role for the invitee').selectOption(role)
        await page.getByRole('button', { name: 'Invite' }).click()
        await expect(page.getByText(new RegExp(`Invited .* as ${role}`))).toBeVisible({ timeout: 20_000 })
      }
      await expect(page.getByTestId('pending-invitation')).toHaveCount(2, { timeout: 20_000 })
    })

    await test.step('invitees accept on their dashboards', async () => {
      for (const user of [bob, carol]) {
        await openDashboard(user)
        const invite = user.page.getByTestId('my-invitation').filter({ hasText: renamed })
        await invite.getByRole('button', { name: 'Accept' }).click()
        await expect(user.page.getByTestId('universe-name')).toHaveText(renamed, { timeout: 20_000 })
      }
      await page.goto(`/u/${universeId}/members`)
      await expect(page.getByTestId('member-row')).toHaveCount(3, { timeout: 20_000 })
      await expect(page.getByTestId('pending-invitation')).toHaveCount(0)
    })

    const kaelId = kaelUrl.split('/').pop() as string
    await test.step('roles: editor edits, viewer reads, both enforced by the server', async () => {
      await bob.page.goto(`${kaelUrl}/edit`)
      // A published article offers "Save changes" (stays published), not "Save draft".
      await expect(bob.page.getByRole('button', { name: 'Save draft' })).toHaveCount(0, { timeout: 20_000 })
      await bob.page.getByTestId('article-summary-input').fill('Edited by the editor.')
      await bob.page.getByRole('button', { name: 'Save changes' }).click()
      await expect(bob.page.getByText(/Changes saved/)).toBeVisible({ timeout: 20_000 })
      await expect(bob.page).toHaveURL(/\/edit$/)
      await expect(bob.page.getByText('Published', { exact: true })).toBeVisible()
      refused(await asBob('inviteMember', { universeId, email: 'x@example.com', role: 'viewer' }), /owner/)
      refused(await asBob('updateUniverse', { universeId, name: 'Hijacked' }), /owner/)

      await carol.page.goto(kaelUrl)
      await expect(carol.page.getByTestId('article-title')).toHaveText('Kael Ashborne', { timeout: 20_000 })
      await expect(carol.page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
      await carol.page.goto(`${kaelUrl}/edit`)
      await expect(carol.page.getByText('Read the article instead')).toBeVisible({ timeout: 20_000 })
      refused(
        await asCarol('saveArticle', {
          articleId: kaelId,
          title: 'Vandalised',
          type: 'character',
          summary: '',
          status: 'draft',
          categoryId: '',
          tags: [],
          coverImageKey: '',
          content: doc('vandal'),
        }),
        /editor access/,
      )
      refused(await asCarol('createArticle', { universeId, title: 'Nope', type: 'lore' }), /editor access/)
      await carol.page.goto(`/u/${universeId}/members`)
      await expect(carol.page.getByLabel('Invite by email')).toHaveCount(0)
      await carol.page.goto(`/u/${universeId}/settings`)
      await expect(carol.page.getByTestId('settings-owner-only')).toBeVisible({ timeout: 20_000 })
      // The universe still carries Alice's name, not Bob's attempt.
      await carol.page.goto(`/u/${universeId}`)
      await expect(carol.page.getByTestId('universe-name')).toHaveText(renamed, { timeout: 20_000 })
    })

    await test.step('mobile layout and accessible names', async () => {
      await bob.page.setViewportSize({ width: 390, height: 844 })
      const pages: Array<[string, string]> = [
        ['dashboard', '/universes'],
        ['overview', `/u/${universeId}`],
        ['library', `/u/${universeId}/articles`],
        ['article', kaelUrl],
        ['editor', `${kaelUrl}/edit`],
        ['members', `/u/${universeId}/members`],
        ['activity', `/u/${universeId}/activity`],
      ]
      const problems: string[] = []
      for (const [label, path] of pages) {
        await bob.page.goto(path)
        await bob.page.waitForLoadState('networkidle').catch(() => undefined)
        await expect(bob.page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 }).catch(() => undefined)
        await bob.page.screenshot({ path: `test-results/qa-mobile-${label}.png`, fullPage: true })
        const { unnamed, overflow } = await audit(bob.page)
        if (overflow > 1) problems.push(`${label}: page scrolls sideways by ${overflow}px`)
        for (const el of unnamed) problems.push(`${label}: control without an accessible name: ${el}`)
      }
      expect(problems).toEqual([])

      // The editor's details panel (connections, category, tags) stacks under
      // the body on a phone and must be reachable by scrolling.
      await bob.page.goto(`${kaelUrl}/edit`)
      const details = bob.page.getByRole('complementary', { name: 'Article details' })
      await details.getByLabel('Relationship type').scrollIntoViewIfNeeded()
      await expect(details.getByLabel('Relationship type')).toBeInViewport({ timeout: 20_000 })
      await bob.page.screenshot({ path: 'test-results/qa-mobile-editor-details.png' })
      // The universe tabs scroll sideways inside their own strip.
      const membersTab = bob.page.getByRole('link', { name: 'Members' })
      await membersTab.scrollIntoViewIfNeeded()
      await expect(membersTab).toBeInViewport()
      await membersTab.click()
      await expect(bob.page).toHaveURL(/\/members$/)
    })
  } finally {
    if (universeId) await asAlice('deleteUniverse', { universeId, confirmName: renamed })
  }
})
