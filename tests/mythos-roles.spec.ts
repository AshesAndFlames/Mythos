/**
 * Phase-1 RBAC spike (ADR-004): proves universe roles end to end against the
 * real worker and RecordRoom, with four signed-in accounts:
 *
 *   Alice — owner   Bob — editor   Carol — viewer   Dave — outsider
 *
 * Needs four usable test accounts named Alice, Bob, Carol and Dave:
 *   npx deepspace test accounts list --usable
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { openDashboard as openUniverses, replaceEditorText, tokenFor, startUniverse } from './helpers/mythos'

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(
  !NAMES.every((n) => available.has(n)),
  `Needs usable test accounts named ${NAMES.join(', ')}.`,
)

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

async function action(request: APIRequestContext, token: string | null, name: string, data: object) {
  const res = await request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data,
  })
  return { status: res.status(), body: (await res.json()) as { success?: boolean; error?: string; data?: unknown } }
}

test('universe roles are enforced by the server', async ({ users }) => {
  const [alice, bob, carol, dave] = await users(NAMES)
  const universeName = `Spike ${Date.now()}`

  // Everyone signs in once, so the app knows them (invites resolve app users).
  await Promise.all([alice, bob, carol, dave].map(openUniverses))

  // ── Alice creates a universe ────────────────────────────────────────────
  await startUniverse(alice.page)
  await alice.page.getByLabel('Name').fill(universeName)
  await alice.page.getByRole('button', { name: 'Create universe' }).click()
  await expect(alice.page.getByTestId('universe-name')).toHaveText(universeName, { timeout: 20_000 })
  const universeUrl = new URL(alice.page.url()).pathname
  const universeId = universeUrl.split('/').pop() as string
  // The owner's universe rail offers Settings and Members.
  await expect(alice.page.locator(`a[href="${universeUrl}/settings"]`)).toHaveText('Settings')

  // ── Alice invites Bob (editor) and Carol (viewer); both accept ──────────
  await alice.page.locator(`a[href="${universeUrl}/members"]`).click()
  for (const [user, role] of [
    [bob, 'editor'],
    [carol, 'viewer'],
  ] as const) {
    await alice.page.getByLabel('Invite by email').fill(user.email)
    await alice.page.getByLabel('Role for the invitee').selectOption(role)
    await alice.page.getByRole('button', { name: 'Invite' }).click()
    await expect(alice.page.getByText(`as ${role}.`)).toBeVisible({ timeout: 20_000 })
  }
  await expect(alice.page.getByTestId('pending-invitation')).toHaveCount(2)
  for (const user of [bob, carol]) {
    await openUniverses(user)
    const invitation = user.page.getByTestId('my-invitation').filter({ hasText: universeName })
    await invitation.getByRole('button', { name: 'Accept' }).click()
    await expect(user.page.getByTestId('universe-name')).toHaveText(universeName, { timeout: 20_000 })
  }
  await expect(alice.page.getByTestId('member-row')).toHaveCount(3, { timeout: 20_000 })

  // ── Alice creates an article ────────────────────────────────────────────
  await alice.page.getByTestId('new-article-button').click()
  await alice.page.getByLabel('Title').fill('Aria')
  await alice.page.getByRole('button', { name: 'Create article' }).click()
  await expect(alice.page).toHaveURL(/\/a\/[^/]+\/edit$/, { timeout: 20_000 })
  const articleUrl = new URL(alice.page.url()).pathname.replace(/\/edit$/, '')
  const articleId = articleUrl.split('/').pop() as string

  // ── Bob (editor) co-edits the body live; Alice reads it as it changes ───
  await alice.page.goto(articleUrl)
  await expect(alice.page.getByTestId('article-title')).toHaveText('Aria', { timeout: 20_000 })
  await bob.page.goto(`${articleUrl}/edit`)
  await replaceEditorText(bob.page, 'Aria was born in the northern marches.')
  await expect(alice.page.getByTestId('article-body-view')).toContainText('Aria was born in the northern marches.', {
    timeout: 20_000,
  })

  // ── Carol (viewer) can read but not write ───────────────────────────────
  await carol.page.goto(articleUrl)
  await expect(carol.page.getByTestId('article-body-view')).toContainText('Aria was born in the northern marches.', {
    timeout: 20_000,
  })
  await expect(carol.page.getByTestId('edit-article')).toHaveCount(0)
  await expect(carol.page.getByTestId('new-article-button')).toHaveCount(0)
  await carol.page.goto(`${articleUrl}/edit`)
  await expect(carol.page.getByRole('heading', { name: 'Editor not found' })).toBeVisible({ timeout: 20_000 })
  await expect(carol.page.getByTestId('article-body-editor')).toHaveCount(0)

  // ── Dave (outsider) sees nothing ────────────────────────────────────────
  await openUniverses(dave)
  await expect(dave.page.getByText(universeName)).toHaveCount(0)
  await dave.page.goto(articleUrl)
  await expect(dave.page.getByRole('heading', { name: 'Universe not found' })).toBeVisible({ timeout: 20_000 })

  // ── Server actions refuse what the role does not allow ──────────────────
  const [carolToken, daveToken, bobToken] = await Promise.all([
    tokenFor(carol.page),
    tokenFor(dave.page),
    tokenFor(bob.page),
  ])
  const viewerCreate = await action(carol.page.request, carolToken, 'createArticle', {
    universeId,
    title: 'Forged',
    type: 'lore',
  })
  expect(viewerCreate.body).toMatchObject({ success: false, error: expect.stringMatching(/editor access/) })

  const outsiderCreate = await action(dave.page.request, daveToken, 'createArticle', {
    universeId,
    title: 'Forged',
    type: 'lore',
  })
  expect(outsiderCreate.body).toMatchObject({ success: false, error: 'Universe not found' })

  const outsiderInvite = await action(dave.page.request, daveToken, 'inviteMember', {
    universeId,
    email: dave.email,
    role: 'editor',
  })
  expect(outsiderInvite.body.success).toBe(false)

  const editorInvite = await action(bob.page.request, bobToken, 'inviteMember', {
    universeId,
    email: dave.email,
    role: 'editor',
  })
  expect(editorInvite.body).toMatchObject({ success: false, error: expect.stringMatching(/owner/) })

  const anonymous = await action(dave.page.request, null, 'createUniverse', { name: 'Nope' })
  expect(anonymous.status).toBe(401)

  const invalid = await action(bob.page.request, bobToken, 'createArticle', {
    universeId,
    title: 'x',
    type: 'spaceship',
  })
  expect(invalid.body.success).toBe(false)

  // ── Demotion takes effect: Bob becomes a viewer ─────────────────────────
  await alice.page.goto(`${universeUrl}/members`)
  await alice.page.getByLabel(/Role for Bob/).selectOption('viewer')
  await expect(alice.page.getByLabel(/Role for Bob/)).toHaveValue('viewer', { timeout: 20_000 })
  await expect
    .poll(async () => (await action(bob.page.request, bobToken, 'createArticle', { universeId, title: 'Late', type: 'lore' })).body.success, {
      timeout: 20_000,
    })
    .toBe(false)
  await bob.page.goto(articleUrl)
  await expect(bob.page.getByTestId('article-title')).toHaveText('Aria', { timeout: 20_000 })
  await expect(bob.page.getByTestId('edit-article')).toHaveCount(0)

  // ── Removal takes effect: Carol loses access ────────────────────────────
  await alice.page.getByTestId('member-row').filter({ hasText: 'Carol' }).getByRole('button', { name: 'Remove' }).click()
  await alice.page.getByRole('button', { name: 'Remove member' }).click()
  await expect(alice.page.getByTestId('member-row')).toHaveCount(2, { timeout: 20_000 })
  await carol.page.goto(articleUrl)
  await expect(carol.page.getByRole('heading', { name: 'Universe not found' })).toBeVisible({ timeout: 20_000 })

  // The removed viewer cannot reach the article through an action either.
  const removedRename = await action(carol.page.request, carolToken, 'renameArticle', {
    articleId,
    title: 'Mine now',
  })
  expect(removedRename.body.success).toBe(false)

  // Clean up, so repeated runs stay under the per-owner universe cap.
  const cleanup = await action(alice.page.request, await tokenFor(alice.page), 'deleteUniverse', {
    universeId,
    confirmName: universeName,
  })
  expect(cleanup.body.success).toBe(true)
})
