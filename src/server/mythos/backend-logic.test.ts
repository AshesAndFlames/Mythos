import { describe, expect, it } from 'vitest'
import { LIMITS } from '../../domain/mythos'
import type { CategoryData, RichTextNode } from '../../domain/records'
import { seedBody, SEED } from '../../actions/seed'
import { checkParent } from './categories'
import { canonicalJson, revisionFingerprint, richTextDocSchema, richTextToPlain } from './richtext'
import type { Envelope } from './store'
import {
  createCategorySchema,
  createLinkSchema,
  deleteUniverseSchema,
  saveRevisionSchema,
  setArticleTagsSchema,
  updateUniverseSettingsSchema,
} from './validation'

const doc = (...paragraphs: string[]): RichTextNode => seedBody(paragraphs)

describe('rich-text validation', () => {
  it('accepts a Tiptap-style document with marks and safe links', () => {
    const value: RichTextNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Origins' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'the map', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
          ],
        },
      ],
    }
    expect(richTextDocSchema.safeParse(value).success).toBe(true)
  })

  it('rejects a root that is not a doc', () => {
    expect(richTextDocSchema.safeParse({ type: 'paragraph' }).success).toBe(false)
  })

  it('rejects javascript: links', () => {
    const value = {
      type: 'doc',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
    }
    expect(richTextDocSchema.safeParse(value).success).toBe(false)
  })

  it('rejects unknown keys, object attributes and odd type names', () => {
    expect(richTextDocSchema.safeParse({ type: 'doc', html: '<b>' }).success).toBe(false)
    expect(richTextDocSchema.safeParse({ type: 'doc', attrs: { style: { color: 'red' } } }).success).toBe(false)
    expect(richTextDocSchema.safeParse({ type: 'doc', content: [{ type: '<script>' }] }).success).toBe(false)
  })

  it('rejects documents nested too deeply', () => {
    let n: RichTextNode = { type: 'text', text: 'deep' }
    for (let i = 0; i < LIMITS.richTextDepth + 1; i++) n = { type: 'blockquote', content: [n] }
    expect(richTextDocSchema.safeParse({ type: 'doc', content: [n] }).success).toBe(false)
  })

  it('rejects documents over the size cap', () => {
    const big = doc('x'.repeat(LIMITS.richTextChars))
    expect(richTextDocSchema.safeParse(big).success).toBe(false)
  })

  it('extracts plain text', () => {
    expect(richTextToPlain(doc('One.', 'Two.'))).toBe('One.\nTwo.')
  })
})

describe('revision fingerprints', () => {
  it('ignore object key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
  })

  it('are stable for equal content and change with any meaningful edit', async () => {
    const base = await revisionFingerprint('Aria', 'A knight', doc('Born in the north.'))
    expect(await revisionFingerprint('Aria', 'A knight', doc('Born in the north.'))).toBe(base)
    expect(await revisionFingerprint('Aria', 'A knight', doc('Born in the south.'))).not.toBe(base)
    expect(await revisionFingerprint('Aria Vell', 'A knight', doc('Born in the north.'))).not.toBe(base)
    expect(await revisionFingerprint('Aria', 'A captain', doc('Born in the north.'))).not.toBe(base)
    expect(base).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('category tree rules', () => {
  const cat = (id: string, parentId = ''): Envelope<CategoryData> => ({
    recordId: id,
    data: { universeId: 'u', name: id, parentId, sortOrder: 0 },
  })
  // a > b > c > d
  const tree = [cat('a'), cat('b', 'a'), cat('c', 'b'), cat('d', 'c'), cat('x')]

  it('allows a top-level or nested category', () => {
    expect(() => checkParent(tree, null, '')).not.toThrow()
    expect(() => checkParent(tree, null, 'c')).not.toThrow()
  })

  it('rejects a parent that does not exist in this universe', () => {
    expect(() => checkParent(tree, null, 'from-another-universe')).toThrow(/not found/)
  })

  it('rejects cycles', () => {
    expect(() => checkParent(tree, 'a', 'a')).toThrow(/inside itself/)
    expect(() => checkParent(tree, 'a', 'c')).toThrow(/inside itself/)
  })

  it(`limits depth to ${LIMITS.categoryDepth} levels`, () => {
    expect(() => checkParent(tree, null, 'd')).not.toThrow() // level 5
    const deeper = [...tree, cat('e', 'd')]
    expect(() => checkParent(deeper, null, 'e')).toThrow(/at most/) // would be level 6
    expect(() => checkParent(tree, 'a', 'x')).not.toThrow() // 4-deep subtree under x: 5 levels
    const withChild = [...tree, cat('y', 'x')]
    expect(() => checkParent(withChild, 'a', 'y')).toThrow(/at most/) // would reach 6 levels
  })
})

describe('action input validation', () => {
  it('rejects self-links and unknown relationship types', () => {
    expect(createLinkSchema.safeParse({ fromArticleId: 'a', toArticleId: 'a', type: 'lives_in' }).success).toBe(false)
    expect(createLinkSchema.safeParse({ fromArticleId: 'a', toArticleId: 'b', type: 'married' }).success).toBe(false)
    expect(createLinkSchema.safeParse({ fromArticleId: 'a', toArticleId: 'b', type: 'lives_in' }).success).toBe(true)
  })

  it('caps tags per article and tag length', () => {
    const many = Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`)
    expect(setArticleTagsSchema.safeParse({ articleId: 'a', tags: many }).success).toBe(false)
    expect(setArticleTagsSchema.safeParse({ articleId: 'a', tags: ['x'.repeat(LIMITS.tag + 1)] }).success).toBe(false)
    expect(setArticleTagsSchema.safeParse({ articleId: 'a', tags: [' '] }).success).toBe(false)
  })

  it('only allows private visibility today', () => {
    expect(updateUniverseSettingsSchema.safeParse({ universeId: 'u', visibility: 'private' }).success).toBe(true)
    expect(updateUniverseSettingsSchema.safeParse({ universeId: 'u', visibility: 'public' }).success).toBe(false)
    expect(updateUniverseSettingsSchema.safeParse({ universeId: 'u' }).success).toBe(false)
  })

  it('requires a confirmation name to delete a universe', () => {
    expect(deleteUniverseSchema.safeParse({ universeId: 'u' }).success).toBe(false)
  })

  it('rejects category parents that are not ids', () => {
    expect(createCategorySchema.safeParse({ universeId: 'u', name: 'People', parentId: '../x' }).success).toBe(false)
    expect(createCategorySchema.parse({ universeId: 'u', name: 'People' }).parentId).toBe('')
  })

  it('validates revision content as a rich-text document', () => {
    expect(saveRevisionSchema.safeParse({ articleId: 'a', content: doc('Hi') }).success).toBe(true)
    expect(saveRevisionSchema.safeParse({ articleId: 'a', content: '<p>Hi</p>' }).success).toBe(false)
  })
})

describe('seed data', () => {
  it('only links articles it defines, and every body is a valid document', () => {
    const keys = new Set(SEED.articles.map((a) => a.key))
    for (const [from, , to] of SEED.links) {
      expect(keys.has(from) && keys.has(to)).toBe(true)
    }
    for (const a of SEED.articles) {
      expect(SEED.categories).toContain(a.category)
      expect(richTextDocSchema.safeParse(seedBody(a.body)).success).toBe(true)
    }
  })
})
