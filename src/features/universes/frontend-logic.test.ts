import { describe, expect, it } from 'vitest'
import { COVER_KEY_PATTERN, coverUrl } from '../../domain/mythos'
import { monogram, plural, relativeTime } from '../../lib/format'
import { saveArticleSchema, updateUniverseSettingsSchema } from '../../server/mythos/validation'
import { categoryOptions } from './categories'
import { EMPTY_FILTERS, parseFilters, serializeFilters } from './filters'
import type { CategoryView } from './hooks'

const KEY = 'covers/0b5c0a52-6a43-4b0e-9f0e-2f1d3c4b5a69.webp'
const ID = '0b5c0a52-6a43-4b0e-9f0e-2f1d3c4b5a69'
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }

describe('cover keys', () => {
  it('accepts only keys Mythos generates', () => {
    expect(COVER_KEY_PATTERN.test(KEY)).toBe(true)
    for (const bad of [
      'covers/x.webp',
      `covers/${ID}.svg`,
      `../covers/${ID}.png`,
      `https://evil.example/${ID}.png`,
      `covers/${ID}.png?x=1`,
      `other/${ID}.png`,
    ]) {
      expect(COVER_KEY_PATTERN.test(bad), bad).toBe(false)
      expect(coverUrl(bad, 'app_X1'), bad).toBeNull()
    }
  })

  it('builds a same-origin URL', () => {
    expect(coverUrl(KEY, 'app_X1')).toBe(`/api/files/apps/app_X1/covers/${ID}.webp?scope=app`)
    expect(coverUrl(KEY, '../x')).toBeNull()
    expect(coverUrl('', 'app_X1')).toBeNull()
    expect(coverUrl(undefined, 'app_X1')).toBeNull()
  })

  it('is validated when a universe cover is set', () => {
    expect(updateUniverseSettingsSchema.safeParse({ universeId: ID, coverImageKey: KEY }).success).toBe(true)
    expect(updateUniverseSettingsSchema.safeParse({ universeId: ID, coverImageKey: '' }).success).toBe(true)
    expect(updateUniverseSettingsSchema.safeParse({ universeId: ID, coverImageKey: 'javascript:alert(1)' }).success).toBe(false)
  })
})

describe('saveArticleSchema', () => {
  const valid = {
    articleId: ID,
    title: '  Lysandra  ',
    type: 'character',
    summary: '',
    status: 'published',
    categoryId: '',
    tags: ['heroine'],
    coverImageKey: '',
    content: doc,
  }

  it('accepts a full editor save and trims text', () => {
    const parsed = saveArticleSchema.parse(valid)
    expect(parsed.title).toBe('Lysandra')
    expect(parsed.note).toBe('')
  })

  it('rejects bad input', () => {
    for (const patch of [
      { title: '   ' },
      { type: 'spaceship' },
      { status: 'archived' },
      { categoryId: 'not an id!' },
      { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
      { coverImageKey: 'covers/evil.png' },
      { content: { type: 'paragraph' } },
      { content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }] } },
    ]) {
      expect(saveArticleSchema.safeParse({ ...valid, ...patch }).success, JSON.stringify(patch)).toBe(false)
    }
  })
})

describe('categoryOptions', () => {
  const cat = (id: string, name: string, parentId = ''): CategoryView => ({ id, name, parentId, universeId: 'u', sortOrder: 0 })

  it('orders a tree depth-first with indentation', () => {
    const out = categoryOptions([cat('b', 'Places'), cat('a', 'People'), cat('c', 'Nobles', 'a'), cat('d', 'Orphan', 'missing')])
    expect(out.map((o) => [o.id, o.depth])).toEqual([
      ['b', 0],
      ['a', 0],
      ['c', 1],
      ['d', 0],
    ])
    expect(out[2].label).toBe(' Nobles')
  })

  it('survives a cycle in stored data', () => {
    const out = categoryOptions([cat('x', 'X', 'y'), cat('y', 'Y', 'x')])
    expect(out).toEqual([])
  })
})

describe('format', () => {
  it('formats relative times and plurals', () => {
    const now = Date.parse('2026-11-20T12:00:00Z')
    expect(relativeTime('2026-11-20T11:59:50Z', now)).toBe('just now')
    expect(relativeTime('2026-11-20T09:00:00Z', now)).toMatch(/3 hours ago/)
    expect(relativeTime('garbage', now)).toBe('')
    expect(plural(1, 'article')).toBe('1 article')
    expect(plural(2, 'entry', 'entries')).toBe('2 entries')
    expect(monogram('  élan')).toBe('É')
    expect(monogram('')).toBe('✦')
  })
})

describe('library filters', () => {
  it('parses and ignores unknown values', () => {
    expect(parseFilters(new URLSearchParams('q=sea&type=location&category=c1&sort=title'))).toEqual({
      q: 'sea',
      type: 'location',
      category: 'c1',
      sort: 'title',
    })
    expect(parseFilters(new URLSearchParams('type=spaceship&sort=chaos'))).toEqual(EMPTY_FILTERS)
  })

  it('round-trips and omits defaults', () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe('')
    const f = { q: 'a b', type: 'lore' as const, category: '', sort: 'created' as const }
    expect(parseFilters(new URLSearchParams(serializeFilters(f)))).toEqual(f)
  })
})
