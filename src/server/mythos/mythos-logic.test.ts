import { describe, expect, it } from 'vitest'
import { computeEditorIds, hasAtLeast, sameIds } from './roles'
import { slugify, uniqueSlug } from './slug'
import {
  createArticleSchema,
  createUniverseSchema,
  firstIssue,
  inviteMemberSchema,
  recordIdSchema,
} from './validation'

describe('roles', () => {
  it('orders viewer < editor < owner', () => {
    expect(hasAtLeast('owner', 'editor')).toBe(true)
    expect(hasAtLeast('editor', 'editor')).toBe(true)
    expect(hasAtLeast('viewer', 'editor')).toBe(false)
    expect(hasAtLeast(null, 'viewer')).toBe(false)
  })

  it('editorIds include active owners and editors only, sorted and unique', () => {
    expect(
      computeEditorIds([
        { userId: 'b', role: 'editor', active: true },
        { userId: 'a', role: 'owner', active: true },
        { userId: 'c', role: 'viewer', active: true },
        { userId: 'd', role: 'editor', active: false },
        { userId: 'b', role: 'editor', active: true },
      ]),
    ).toEqual(['a', 'b'])
  })

  it('sameIds ignores order on the stored side', () => {
    expect(sameIds(['b', 'a'], ['a', 'b'])).toBe(true)
    expect(sameIds(['a'], ['a', 'b'])).toBe(false)
    expect(sameIds(undefined, [])).toBe(false)
  })
})

describe('slugs', () => {
  it('normalizes titles', () => {
    expect(slugify('Aria of the Silver Order')).toBe('aria-of-the-silver-order')
    expect(slugify('  Éowyn’s Blade!  ')).toBe('eowyns-blade')
    expect(slugify('???')).toBe('untitled')
  })

  it('caps length without a trailing dash', () => {
    const s = slugify(`${'a'.repeat(119)} b`)
    expect(s.length).toBeLessThanOrEqual(120)
    expect(s.endsWith('-')).toBe(false)
  })

  it('finds the first free suffix', () => {
    expect(uniqueSlug('aria', new Set())).toBe('aria')
    expect(uniqueSlug('aria', new Set(['aria', 'aria-2']))).toBe('aria-3')
  })
})

describe('validation', () => {
  it('trims and requires a universe name', () => {
    expect(createUniverseSchema.parse({ name: '  Realms ' })).toMatchObject({ name: 'Realms', tagline: '' })
    const bad = createUniverseSchema.safeParse({ name: '   ' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(firstIssue(bad.error)).toMatch(/Name is required/)
  })

  it('rejects over-long input', () => {
    expect(createUniverseSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false)
  })

  it('rejects ids that are not plain identifiers', () => {
    expect(recordIdSchema.safeParse('abc-123_X').success).toBe(true)
    expect(recordIdSchema.safeParse('../users').success).toBe(false)
    expect(recordIdSchema.safeParse('a b').success).toBe(false)
  })

  it('only allows assignable roles on invite — never owner', () => {
    const base = { universeId: 'u1', email: 'Friend@Example.com' }
    expect(inviteMemberSchema.parse({ ...base, role: 'viewer' }).email).toBe('friend@example.com')
    expect(inviteMemberSchema.safeParse({ ...base, role: 'owner' }).success).toBe(false)
    expect(inviteMemberSchema.safeParse({ ...base, email: 'nope', role: 'editor' }).success).toBe(false)
  })

  it('restricts article types to the catalog', () => {
    expect(createArticleSchema.safeParse({ universeId: 'u1', title: 'Aria', type: 'species' }).success).toBe(true)
    expect(createArticleSchema.safeParse({ universeId: 'u1', title: 'Aria', type: 'spaceship' }).success).toBe(false)
  })
})
