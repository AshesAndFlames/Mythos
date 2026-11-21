/** Shared helpers for the Mythos end-to-end specs. */

import { existsSync, readFileSync } from 'node:fs'
import type { APIRequestContext, Page } from '@playwright/test'
import { expect, type MultiplayerUser } from 'deepspace/testing'

export type ActionResult = { success?: boolean; error?: string; data?: Record<string, unknown> }

/** A JWT for the signed-in browser context, minted the same way the SDK does. */
export async function tokenFor(page: Page): Promise<string> {
  const res = await page.request.post('/api/auth/token', { headers: { 'Content-Type': 'application/json' } })
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { token?: string }
  expect(body.token).toBeTruthy()
  return body.token as string
}

/** The signed-in account's user id (the verified token's subject). */
export async function userIdOf(page: Page): Promise<string> {
  const token = await tokenFor(page)
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { sub?: string }
  expect(payload.sub).toBeTruthy()
  return payload.sub as string
}

export async function openDashboard(user: MultiplayerUser) {
  await user.page.goto('/universes')
  await expect(user.page.getByRole('heading', { name: 'Your universes' })).toBeVisible({ timeout: 20_000 })
}

/** Signs a user in to the app (so invites can find them) and returns an action caller. */
export async function caller(user: MultiplayerUser) {
  await openDashboard(user)
  const token = await tokenFor(user.page)
  return async (name: string, params: object): Promise<ActionResult> => {
    const res = await user.page.request.post(`/api/actions/${name}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: params,
    })
    return (await res.json()) as ActionResult
  }
}

type Caller = (name: string, params: object) => Promise<ActionResult>

/** The owner invites `email`, and the invitee accepts: an active membership. */
export async function addMember(asOwner: Caller, asInvitee: Caller, universeId: string, email: string, role: 'editor' | 'viewer') {
  const invited = await asOwner('inviteMember', { universeId, email, role })
  expect(invited.error, 'invite refused').toBeUndefined()
  const accepted = await asInvitee('respondToInvitation', { invitationId: invited.data?.invitationId, accept: true })
  expect(accepted.error, 'accept refused').toBeUndefined()
}

/** The app id the local worker serves (wrangler.toml is its source of truth). */
function appId(): string {
  const file = ['wrangler.toml', '../wrangler.toml'].find((p) => existsSync(p)) as string
  return (/DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(readFileSync(file, 'utf8')) as RegExpExecArray)[1]
}

/**
 * Reads the stored bytes of one record-bound Yjs document straight from the
 * local RecordRoom's SQLite, through wrangler's local explorer API (local dev
 * only). Returns hex, or null when no document is stored under that key.
 */
export async function storedDocHex(request: APIRequestContext, docKey: string): Promise<string | null> {
  const api = '/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces'
  const namespaces = (await (await request.get(api)).json()) as { result: Array<{ id: string; class: string }> }
  const ns = namespaces.result.find((n) => n.class === 'AppRecordRoom')
  expect(ns, 'local explorer lists the record room').toBeTruthy()
  const res = await request.post(`${api}/${ns?.id}/query`, {
    data: {
      durable_object_name: `app:${appId()}`,
      queries: [{ sql: 'SELECT hex(state) FROM yjs_docs WHERE doc_key = ?', params: [docKey] }],
    },
  })
  const body = (await res.json()) as { success: boolean; result: Array<{ rows: string[][] }> }
  expect(body.success, 'explorer query succeeded').toBe(true)
  return body.result[0]?.rows[0]?.[0] ?? null
}

export const hexOf = (text: string) => Buffer.from(text, 'utf8').toString('hex').toUpperCase()

/** Replaces the rich-text body in the open editor page with `text`. */
export async function replaceEditorText(page: Page, text: string) {
  await expect(page.getByTestId('body-sync-state')).toHaveText(/Live/, { timeout: 20_000 })
  const editor = page.getByTestId('article-body-editor')
  await expect(editor).toHaveAttribute('contenteditable', 'true', { timeout: 20_000 })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.insertText(text)
}

/** Types into an article body through the real editor and waits until the room has stored it. */
export async function typeBody(user: MultiplayerUser, universeId: string, articleId: string, text: string) {
  await user.page.goto(`/u/${universeId}/a/${articleId}/edit`)
  await replaceEditorText(user.page, text)
  await expect
    .poll(async () => (await storedDocHex(user.page.request, `articles:${articleId}:body`))?.includes(hexOf(text)), {
      timeout: 20_000,
    })
    .toBe(true)
}

/** Opens the "found a universe" dialog from the dashboard, whichever button the list state shows. */
export async function startUniverse(page: Page) {
  await page
    .getByTestId('new-universe-button')
    .or(page.getByRole('button', { name: 'Create a universe' }))
    .first()
    .click({ timeout: 20_000 })
}
