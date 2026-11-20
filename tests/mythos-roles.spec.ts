/**
 * Phase-1 RBAC spike (ADR-004): proves universe roles end to end against the
 * real worker and RecordRoom, with four signed-in accounts:
 *
 *   Alice — owner   Bob — editor   Carol — viewer   Dave — outsider
 *
 * Needs four usable test accounts named Alice, Bob, Carol and Dave:
 *   npx deepspace test accounts list --usable
 */
import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(
  !NAMES.every((n) => available.has(n)),
  `Needs usable test accounts named ${NAMES.join(', ')}.`,
)

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

/** A JWT for the signed-in browser context, minted the same way the SDK does. */
async function tokenFor(page: Page): Promise<string> {
  const res = await page.request.post('/api/auth/token', { headers: { 'Content-Type': 'application/json' } })
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { token?: string }
  expect(body.token).toBeTruthy()
  return body.token as string
}

async function action(request: APIRequestContext, token: string | null, name: string, data: object) {
  const res = await request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data,
  })
  return { status: res.status(), body: (await res.json()) as { success?: boolean; error?: string; data?: unknown } }
}

async function openUniverses(user: MultiplayerUser) {
  await user.page.goto('/universes')
  await expect(user.page.getByRole('heading', { name: 'Your universes' })).toBeVisible({ timeout: 20_000 })
}

test('universe roles are enforced by the server', async ({ users }) => {
  const [alice, bob, carol, dave] = await users(NAMES)
  const universeName = `Spike ${Date.now()}`

  // Everyone signs in once, so the app knows them (invites resolve app users).
  await Promise.all([alice, bob, carol, dave].map(openUniverses))

  // ── Alice creates a universe ────────────────────────────────────────────
  const createButton = alice.page.getByTestId('new-universe-button')
  if (await createButton.isVisible()) await createButton.click()
  else await alice.page.getByRole('button', { name: 'Create a universe' }).click()
  await alice.page.getByLabel('Name').fill(universeName)
  await alice.page.getByRole('button', { name: 'Create universe' }).click()
  await expect(alice.page.getByTestId('universe-name')).toHaveText(universeName, { timeout: 20_000 })
  const universeUrl = new URL(alice.page.url()).pathname
  const universeId = universeUrl.split('/').pop() as string
  await expect(alice.page.getByTestId('my-universe-role')).toHaveText('owner')

  // ── Alice invites Bob (editor) and Carol (viewer) ───────────────────────
  for (const [user, role] of [
    [bob, 'editor'],
    [carol, 'viewer'],
  ] as const) {
    await alice.page.getByLabel('Invite by email').fill(user.email)
    await alice.page.getByLabel('Role for the invitee').selectOption(role)
    await alice.page.getByRole('button', { name: 'Invite' }).click()
    await expect(alice.page.getByText(`as ${role}.`)).toBeVisible({ timeout: 20_000 })
  }
  await expect(alice.page.getByTestId('member-row')).toHaveCount(3)

  // ── Alice creates an article ────────────────────────────────────────────
  await alice.page.getByTestId('new-article-button').click()
  await alice.page.getByLabel('Title').fill('Aria')
  await alice.page.getByRole('button', { name: 'Create article' }).click()
  await expect(alice.page.getByTestId('article-title')).toHaveText('Aria', { timeout: 20_000 })
  const articleUrl = new URL(alice.page.url()).pathname
  const articleId = articleUrl.split('/').pop() as string

  // ── Bob (editor) co-edits the body live ─────────────────────────────────
  await bob.page.goto(articleUrl)
  await expect(bob.page.getByTestId('body-sync-state')).toHaveText(/Live/, { timeout: 20_000 })
  await expect(alice.page.getByTestId('body-sync-state')).toHaveText(/Live/, { timeout: 20_000 })
  await bob.page.getByTestId('article-body').fill('Aria was born in the northern marches.')
  await expect(alice.page.getByTestId('article-body')).toHaveValue('Aria was born in the northern marches.', {
    timeout: 20_000,
  })

  // ── Carol (viewer) can read but not write ───────────────────────────────
  await carol.page.goto(articleUrl)
  await expect(carol.page.getByTestId('body-sync-state')).toHaveText('Read only', { timeout: 20_000 })
  await expect(carol.page.getByTestId('article-body')).toHaveValue('Aria was born in the northern marches.')
  await expect(carol.page.getByTestId('article-body')).toHaveAttribute('readonly', '')
  await expect(carol.page.getByTestId('article-summary-input')).toHaveCount(0)

  // ── Dave (outsider) sees nothing ────────────────────────────────────────
  await openUniverses(dave)
  await expect(dave.page.getByText(universeName)).toHaveCount(0)
  await dave.page.goto(articleUrl)
  await expect(dave.page.getByRole('heading', { name: 'Article not found' })).toBeVisible({ timeout: 20_000 })

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
  await alice.page.goto(universeUrl)
  await alice.page.getByLabel(/Role for Bob/).selectOption('viewer')
  await expect(alice.page.getByLabel(/Role for Bob/)).toHaveValue('viewer', { timeout: 20_000 })
  await expect
    .poll(async () => (await action(bob.page.request, bobToken, 'createArticle', { universeId, title: 'Late', type: 'lore' })).body.success, {
      timeout: 20_000,
    })
    .toBe(false)
  await bob.page.goto(articleUrl)
  await expect(bob.page.getByTestId('body-sync-state')).toHaveText('Read only', { timeout: 20_000 })

  // ── Removal takes effect: Carol loses access ────────────────────────────
  await alice.page.getByRole('listitem').filter({ hasText: 'Carol' }).getByRole('button', { name: 'Remove' }).click()
  await expect(alice.page.getByTestId('member-row')).toHaveCount(2, { timeout: 20_000 })
  await carol.page.goto(articleUrl)
  await expect(carol.page.getByRole('heading', { name: 'Article not found' })).toBeVisible({ timeout: 20_000 })

  // The removed viewer cannot reach the article through an action either.
  const removedRename = await action(carol.page.request, carolToken, 'renameArticle', {
    articleId,
    title: 'Mine now',
  })
  expect(removedRename.body.success).toBe(false)
})
