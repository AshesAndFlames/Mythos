import { describe, expect, it } from 'vitest'
import { coverKeyAllowed, coverKeyUniverse, coverUrl, COVER_MAX_BYTES } from '../../domain/mythos'
import { coverKeySchema } from './validation'
import { classifyFilesRequest, extensionMatches, sniffImage, UPLOAD_ENVELOPE_BYTES, utcDay } from './uploads'

const UUID = '0b6c1f9e-3a2d-4c5b-9e8f-7a6b5c4d3e2f'
const U = 'uni_A-1'
const key = (ext = 'png', universe: string | null = U) => (universe ? `covers/${universe}/${UUID}.${ext}` : `covers/${UUID}.${ext}`)
const url = (path: string, query = '') => new URL(`https://mythos.test${path}${query}`)
const upload = (k: string, scope = 'app') => url('/api/files/upload', `?scope=${scope}&key=${encodeURIComponent(k)}`)

describe('cover keys', () => {
  it('name their universe; keys from before the rule name none', () => {
    expect(coverKeyUniverse(key())).toBe(U)
    expect(coverKeyUniverse(key('png', null))).toBeNull()
    expect(coverKeyUniverse(`covers/${U}/not-a-uuid.png`)).toBeNull()
    expect(coverKeyUniverse(`covers/../${UUID}.png`)).toBeNull()
  })
  it('validate in both forms, so saved covers keep working', () => {
    expect(coverKeySchema.safeParse(key()).success).toBe(true)
    expect(coverKeySchema.safeParse(key('jpeg', null)).success).toBe(true)
    expect(coverKeySchema.safeParse(`covers/${U}/${UUID}.svg`).success).toBe(false)
    expect(coverKeySchema.safeParse(`covers/a/b/${UUID}.png`).success).toBe(false)
    expect(coverUrl(key(), 'app_1')).toBe(`/api/files/apps/app_1/covers/${U}/${UUID}.png?scope=app`)
  })
  it('may be saved only in their own universe (or kept, or cleared)', () => {
    expect(coverKeyAllowed(key(), U, '')).toBe(true)
    expect(coverKeyAllowed(key(), 'other', '')).toBe(false)
    expect(coverKeyAllowed(key('png', null), U, '')).toBe(false)
    expect(coverKeyAllowed(key('png', null), U, key('png', null))).toBe(true)
    expect(coverKeyAllowed('', U, key())).toBe(true)
  })
})

describe('classifyFilesRequest', () => {
  it('lets single-file reads through and refuses listing', () => {
    expect(classifyFilesRequest('GET', url(`/api/files/apps/x/${key()}`, '?scope=app'), null)).toEqual({ kind: 'read' })
    expect(classifyFilesRequest('HEAD', url(`/api/files/apps/x/${key()}`), null)).toEqual({ kind: 'read' })
    for (const path of ['/api/files', '/api/files/']) {
      expect(classifyFilesRequest('GET', url(path, '?scope=app'), null)).toMatchObject({ kind: 'refuse', status: 403 })
    }
  })
  it('refuses every write but a cover upload', () => {
    const target = url(`/api/files/apps/x/${key()}`, '?scope=app')
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      expect(classifyFilesRequest(method, target, '10')).toMatchObject({ kind: 'refuse', status: 403 })
    }
    for (const path of ['/api/files/multipart', '/api/files/multipart/part', '/api/files/multipart/complete']) {
      expect(classifyFilesRequest('POST', url(path, `?scope=app&key=${key()}`), '10')).toMatchObject({ status: 403 })
    }
  })
  it('accepts a sized cover upload into the app scope under a universe key', () => {
    expect(classifyFilesRequest('POST', upload(key()), '1000')).toEqual({ kind: 'upload', key: key(), universeId: U })
    expect(classifyFilesRequest('POST', upload(key(), 'self'), '1000')).toMatchObject({ status: 403 })
    expect(classifyFilesRequest('POST', upload(key('png', null)), '1000')).toMatchObject({ status: 400 })
    expect(classifyFilesRequest('POST', upload('junk/a.txt'), '1000')).toMatchObject({ status: 400 })
    expect(classifyFilesRequest('POST', upload(key()), null)).toMatchObject({ status: 411 })
    expect(classifyFilesRequest('POST', upload(key()), 'lots')).toMatchObject({ status: 413 })
    const limit = COVER_MAX_BYTES + UPLOAD_ENVELOPE_BYTES
    expect(classifyFilesRequest('POST', upload(key()), String(limit))).toMatchObject({ kind: 'upload' })
    expect(classifyFilesRequest('POST', upload(key()), String(limit + 1))).toMatchObject({ status: 413 })
  })
})

describe('sniffImage', () => {
  const bytes = (...parts: Array<number[] | string>) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
  it('recognises the four cover types by their signatures', () => {
    expect(sniffImage(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImage(bytes('GIF89a'))).toBe('image/gif')
    expect(sniffImage(bytes('GIF87a'))).toBe('image/gif')
    expect(sniffImage(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp')
  })
  it('refuses everything else, whatever it claims to be', () => {
    expect(sniffImage(bytes('<svg xmlns='))).toBeNull()
    expect(sniffImage(bytes('<!doctype html>'))).toBeNull()
    expect(sniffImage(bytes('RIFF', [0, 0, 0, 0], 'AVI LIST'))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
  it('requires the key extension to match the real type', () => {
    expect(extensionMatches(key('jpg'), 'image/jpeg')).toBe(true)
    expect(extensionMatches(key('jpeg'), 'image/jpeg')).toBe(true)
    expect(extensionMatches(key('gif'), 'image/png')).toBe(false)
  })
})

describe('utcDay', () => {
  it('counts in UTC days', () => {
    expect(utcDay(new Date('2026-11-20T23:59:59.999Z'))).toBe('2026-11-20')
    expect(utcDay(new Date('2026-11-21T00:00:00.000Z'))).toBe('2026-11-21')
  })
})
