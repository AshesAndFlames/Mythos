/**
 * Maps and images (ADR-025) and the account assistant setting (ADR-026),
 * against the real worker, RecordRoom and file store.
 *
 *   Alice — owner of universe A   Bob — editor   Carol — viewer   Dave — outsider (owns B)
 */
import { existsSync, readFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { addMember, caller, tokenFor, type ActionResult } from './helpers/mythos'

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(!NAMES.every((n) => available.has(n)), `Needs usable test accounts named ${NAMES.join(', ')}.`)
test.setTimeout(300_000)

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
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

test('maps and images: upload, gallery, attach to articles, delete; assistant setting', async ({ users }) => {
  const [alice, bob, carol, dave] = await users(NAMES)
  const [asAlice, asBob, asCarol, asDave] = await Promise.all([alice, bob, carol, dave].map(caller))
  const [tb, tc] = await Promise.all([tokenFor(bob.page), tokenFor(carol.page)])
  const request = alice.page.request
  const upload = (token: string, key: string, buffer: Buffer) =>
    request.post(`/api/files/upload?scope=app&key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: 'map.png', mimeType: 'image/png', buffer } },
    })

  const stamp = Date.now()
  const name = `Gallery ${stamp}`
  const A = ok(await asAlice('createUniverse', { name })).universeId as string
  const B = ok(await asDave('createUniverse', { name: `Gallery B ${stamp}` })).universeId as string
  const mediaKey = (universe = A) => `media/${universe}/${crypto.randomUUID()}.png`
  await addMember(asAlice, asBob, A, bob.email, 'editor')
  await addMember(asAlice, asCarol, A, carol.email, 'viewer')

  try {
    let mapId = ''
    let mapKey = ''

    await test.step('editors upload and add to the gallery; viewers and outsiders cannot', async () => {
      mapKey = mediaKey()
      const up = await upload(tb, mapKey, PNG)
      expect(up.status(), await up.text()).toBe(200)
      mapId = ok(await asBob('addMedia', { universeId: A, key: mapKey, title: 'World map', caption: 'The known lands', kind: 'map' }))
        .mediaId as string

      expect((await upload(tc, mediaKey(), PNG)).status()).toBe(403)
      refused(await asCarol('addMedia', { universeId: A, key: mapKey, title: 'Mine', kind: 'image' }), /editor access/)
      refused(await asDave('addMedia', { universeId: A, key: mapKey, title: 'Mine', kind: 'image' }), /not found/)
      // Integrity: a key never uploaded, a key of another universe, a duplicate, a bad kind.
      refused(await asBob('addMedia', { universeId: A, key: mediaKey(), title: 'Ghost', kind: 'map' }), /Upload the image/)
      refused(await asBob('addMedia', { universeId: A, key: mediaKey(B), title: 'Stolen', kind: 'map' }), /another universe/)
      refused(await asBob('addMedia', { universeId: A, key: mapKey, title: 'Again', kind: 'map' }), /already in the gallery/)
      refused(await asBob('addMedia', { universeId: A, key: mediaKey(), title: 'X', kind: 'video' }), /Invalid|option/i)
    })

    await test.step('maps may be up to 15 MB (covers stay at 5 MB)', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)])
      expect((await upload(tb, mediaKey(), big)).status()).toBe(200)
      const tooBig = Buffer.concat([PNG, Buffer.alloc(15 * 1024 * 1024)])
      const res = await upload(tb, mediaKey(), tooBig)
      expect(res.status()).toBe(413)
      expect(await res.text()).toMatch(/15 MB/)
    })

    await test.step('editors edit details; viewers cannot', async () => {
      ok(await asBob('updateMedia', { mediaId: mapId, title: 'The Known World' }))
      refused(await asCarol('updateMedia', { mediaId: mapId, title: 'Mine now' }), /editor access/)
      refused(await asDave('updateMedia', { mediaId: mapId, title: 'Mine now' }), /not found/)
    })

    const article = ok(await asBob('createArticle', { universeId: A, title: 'The Coast', type: 'location' })).articleId as string

    await test.step('images attach to articles of the same universe only', async () => {
      ok(await asBob('setArticleMedia', { articleId: article, mediaIds: [mapId] }))
      refused(await asCarol('setArticleMedia', { articleId: article, mediaIds: [] }), /editor access/)
      refused(await asBob('setArticleMedia', { articleId: article, mediaIds: ['not-a-gallery-item'] }), /Image not found/)
      refused(await asBob('setArticleMedia', { articleId: article, mediaIds: [mapId, mapId] }), /only once/)
    })

    await test.step('public readers see attached images of published articles only', async () => {
      ok(
        await asBob('saveArticle', {
          articleId: article,
          title: 'The Coast',
          type: 'location',
          summary: '',
          status: 'published',
          categoryId: '',
          tags: [],
          coverImageKey: '',
          content: doc('Waves.'),
        }),
      )
      ok(await asAlice('updateUniverse', { universeId: A, visibility: 'public' }))
      const page = ok(await asDave('getPublicArticle', { universeId: A, articleId: article }))
      expect((page.media as Array<{ title: string; key: string }>).map((m) => m.title)).toEqual(['The Known World'])
    })

    await test.step('the gallery page shows it to members', async () => {
      await carol.page.goto(`/u/${A}/media`)
      await expect(carol.page.getByTestId('media-card')).toHaveCount(1)
      await expect(carol.page.getByTestId('media-upload-open')).toHaveCount(0)
      await carol.page.getByTestId('media-card').click()
      await expect(carol.page.getByRole('dialog')).toContainText('The Known World')
      await expect(carol.page.getByTestId('media-delete')).toHaveCount(0)
    })

    await test.step('deleting removes it from articles and deletes the file', async () => {
      refused(await asCarol('deleteMedia', { mediaId: mapId }), /editor access/)
      const deleted = ok(await asBob('deleteMedia', { mediaId: mapId }))
      expect(deleted.fileDeleted).toBe(true)
      const page = ok(await asDave('getPublicArticle', { universeId: A, articleId: article }))
      expect(page.media).toEqual([])
      const gone = await request.get(`/api/files/apps/${appId()}/${mapKey}?scope=app`)
      expect(gone.status()).toBe(404)
    })

    await test.step('the assistant can be turned off per account, and the server enforces it', async () => {
      ok(await asCarol('setAccountSettings', { assistantEnabled: false }))
      refused(await asCarol('setAccountSettings', { assistantEnabled: 'no' }), /boolean|Invalid/i)
      const chat = await request.post('/api/ai/chat', {
        headers: { Authorization: `Bearer ${tc}` },
        data: { chatId: 'x', userMessageId: 'y', content: 'hello' },
      })
      expect(chat.status()).toBe(403)
      expect(((await chat.json()) as { code?: string }).code).toBe('assistant_disabled')

      // The panel is gone and the switch shows off.
      await carol.page.goto('/settings')
      await expect(carol.page.getByTestId('assistant-toggle')).toHaveAttribute('aria-checked', 'false')
      await expect(carol.page.getByRole('button', { name: /^(Open|Close) assistant$/ })).toHaveCount(0)

      // Turning it back on from the switch shows the panel again.
      await carol.page.getByTestId('assistant-toggle').click()
      await expect(carol.page.getByTestId('assistant-toggle')).toHaveAttribute('aria-checked', 'true')
      await expect(carol.page.getByRole('button', { name: /^(Open|Close) assistant$/ }).first()).toBeVisible()
    })
  } finally {
    await asCarol('setAccountSettings', { assistantEnabled: true })
    await asAlice('deleteUniverse', { universeId: A, confirmName: name })
    await asDave('deleteUniverse', { universeId: B, confirmName: `Gallery B ${stamp}` })
  }
})

/** The app id the local worker serves (wrangler.toml), for building a file URL. */
function appId(): string {
  const file = ['wrangler.toml', '../wrangler.toml'].find((p) => existsSync(p)) as string
  return (/DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(readFileSync(file, 'utf8')) as RegExpExecArray)[1]
}
