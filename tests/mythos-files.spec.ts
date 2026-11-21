/**
 * The /api/files proxy only serves single files and accepts validated cover
 * uploads from owners and editors (SECURITY_REVIEW.md, S-1).
 *
 *   Alice — owns universe A, so she may upload its covers.
 *   Dave  — signed in and owns universe B, but has no role in A.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { caller, tokenFor } from './helpers/mythos'

const NAMES = ['Alice', 'Dave']
const available = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(!NAMES.every((n) => available.has(n)), `Needs usable test accounts named ${NAMES.join(', ')}.`)
test.setTimeout(180_000)

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
let universeA = ''
const coverKey = (ext = 'png', universe = universeA) => `covers/${universe}/${crypto.randomUUID()}.${ext}`

test('files: covers only, from owners and editors, never listed, changed or deleted', async ({ users }) => {
  const [alice, dave] = await users(NAMES)
  const [asAlice, asDave] = await Promise.all([caller(alice), caller(dave)])
  const [ta, td] = await Promise.all([tokenFor(alice.page), tokenFor(dave.page)])
  const request = alice.page.request
  const upload = (token: string, key: string, buffer: Buffer, mimeType = 'image/png') =>
    request.post(`/api/files/upload?scope=app&key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: 'cover', mimeType, buffer } },
    })
  const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

  const stamp = Date.now()
  const universeName = `Files ${stamp}`
  const daveUniverse = `Files B ${stamp}`
  universeA = (await asAlice('createUniverse', { name: universeName })).data?.universeId as string
  const universeB = (await asDave('createUniverse', { name: daveUniverse })).data?.universeId as string
  expect(universeA && universeB).toBeTruthy()
  try {
    // Dave owns B, but has no role in A: he cannot upload A's covers.
    const refusedForDave = await upload(td, coverKey(), PNG)
    expect(refusedForDave.status()).toBe(403)
    expect(await refusedForDave.text()).toMatch(/owners and editors of this universe/)
    // Keys must name a universe (the pre-review form is no longer accepted for uploads).
    expect((await upload(ta, `covers/${crypto.randomUUID()}.png`, PNG)).status()).toBe(400)

    const key = coverKey()
    const created = await upload(ta, key, PNG)
    expect(created.status(), await created.text()).toBe(200)
    const full = ((await created.json()) as { key: string }).key
    expect(full).toMatch(new RegExp(`/${key}$`))

    // A cover renders for anyone holding its URL (plain <img>), as before.
    const read = await request.get(`/api/files/${full}?scope=app`, { headers: { Cookie: '' } })
    expect(read.status()).toBe(200)
    expect(read.headers()['content-type']).toBe('image/png')

    // Nobody can overwrite, delete or list.
    expect((await upload(ta, key, PNG)).status()).toBe(409)
    expect((await upload(td, key, PNG)).status()).toBe(403)
    expect((await request.delete(`/api/files/${full}?scope=app`, bearer(ta))).status()).toBe(403)
    expect((await request.delete(`/api/files/${full}?scope=app`, bearer(td))).status()).toBe(403)
    expect((await request.get('/api/files?scope=app', bearer(td))).status()).toBe(403)
    expect((await request.get('/api/files/?scope=app', bearer(ta))).status()).toBe(403)
    expect((await request.post(`/api/files/multipart?scope=app&key=${coverKey()}`, bearer(ta))).status()).toBe(403)
    expect((await request.get(`/api/files/${full}?scope=app`)).status()).toBe(200)

    // Only cover keys, real image bytes matching the key, within 5 MB, in the app scope.
    expect((await upload(ta, `junk/${crypto.randomUUID()}.txt`, Buffer.from('hi'), 'text/plain')).status()).toBe(400)
    expect((await upload(ta, coverKey(), Buffer.from('not an image at all'))).status()).toBe(415)
    expect((await upload(ta, coverKey('gif'), PNG, 'image/gif')).status()).toBe(415)
    expect((await upload(ta, coverKey(), Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))).status()).toBe(413)
    expect(
      (
        await request.post(`/api/files/upload?scope=self&key=${coverKey()}`, {
          ...bearer(ta),
          multipart: { file: { name: 'c', mimeType: 'image/png', buffer: PNG } },
        })
      ).status(),
    ).toBe(403)
    // A cover uploaded for B cannot be attached in A, and vice versa.
    const bKey = coverKey('png', universeB)
    expect((await upload(td, bKey, PNG)).status()).toBe(200)
    const crossed = await asAlice('updateUniverse', { universeId: universeA, coverImageKey: bKey })
    expect(crossed.error).toMatch(/another universe/)
    expect((await asAlice('updateUniverse', { universeId: universeA, coverImageKey: key })).success).toBe(true)
    expect((await asDave('updateUniverse', { universeId: universeB, coverImageKey: key })).error).toMatch(/another universe/)

    // Anonymous uploads are refused.
    expect(
      (
        await request.post(`/api/files/upload?scope=app&key=${coverKey()}`, {
          headers: { Cookie: '' },
          multipart: { file: { name: 'c', mimeType: 'image/png', buffer: PNG } },
        })
      ).status(),
    ).toBe(401)
  } finally {
    await asAlice('deleteUniverse', { universeId: universeA, confirmName: universeName })
    await asDave('deleteUniverse', { universeId: universeB, confirmName: daveUniverse })
  }
})
