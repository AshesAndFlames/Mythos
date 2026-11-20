import { existsSync, readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

/** The app id the local worker serves, read from wrangler.toml (its only source of truth). */
function appId(): string {
  const file = ['wrangler.toml', '../wrangler.toml'].find((p) => existsSync(p))
  if (!file) throw new Error('wrangler.toml not found')
  const match = /DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(readFileSync(file, 'utf8'))
  if (!match) throw new Error('DEEPSPACE_APP_ID missing from wrangler.toml')
  return match[1]
}

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  // Mythos is fully private (ADR-010): sockets need a verified JWT, and only
  // the app's own record room may be opened.
  test('record socket refuses a request without a token', async ({ request }) => {
    const res = await request.get(`/ws/app:${appId()}`)
    expect(res.status()).toBe(401)
  })

  test('record socket refuses any room but the app room', async ({ request }) => {
    const res = await request.get('/ws/app:someone-elses-room?token=x')
    expect(res.status()).toBe(404)
  })

  test('actions refuse anonymous callers', async ({ request }) => {
    const res = await request.post('/api/actions/createUniverse', { data: { name: 'Nope' } })
    expect(res.status()).toBe(401)
  })
})
