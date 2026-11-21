import { describe, expect, it } from 'vitest'
import { LINK_TYPES, type LinkType } from './mythos'
import {
  canonicalLink,
  endsFor,
  groupConnections,
  isDuplicateLink,
  LINK_TYPE_META,
  linkOptions,
  wouldCreateLoop,
  type LinkEdge,
} from './relationships'
import { createLinkSchema } from '../server/mythos/validation'

let n = 0
const edge = (fromArticleId: string, type: LinkType, toArticleId: string): LinkEdge => ({
  id: `l${++n}`,
  fromArticleId,
  toArticleId,
  type,
})

describe('link type metadata', () => {
  it('covers every link type, and only hierarchies are acyclic', () => {
    expect(Object.keys(LINK_TYPE_META).sort()).toEqual([...LINK_TYPES].sort())
    for (const [type, meta] of Object.entries(LINK_TYPE_META)) {
      if (meta.symmetric) expect(meta.forward, type).toBe(meta.inverse)
      expect(meta.symmetric && meta.acyclic, type).toBe(false)
      expect(meta.acyclic, type).toBe(Boolean(meta.loopMessage))
    }
    expect(LINK_TYPE_META.lives_in).toMatchObject({ forward: 'lives in', inverse: 'home of' })
  })
})

describe('canonical storage and duplicates', () => {
  it('stores symmetric links in one order, directed links as given', () => {
    expect(canonicalLink('b', 'a', 'ally_of')).toEqual({ fromArticleId: 'a', toArticleId: 'b' })
    expect(canonicalLink('a', 'b', 'ally_of')).toEqual({ fromArticleId: 'a', toArticleId: 'b' })
    expect(canonicalLink('b', 'a', 'lives_in')).toEqual({ fromArticleId: 'b', toArticleId: 'a' })
  })

  it('treats the reverse of a symmetric link as a duplicate, but not of a directed one', () => {
    const edges = [edge('aria', 'ally_of', 'bran'), edge('aria', 'member_of', 'order')]
    expect(isDuplicateLink(edges, 'aria', 'bran', 'ally_of')).toBe(true)
    expect(isDuplicateLink(edges, 'bran', 'aria', 'ally_of')).toBe(true)
    expect(isDuplicateLink(edges, 'aria', 'bran', 'enemy_of')).toBe(false)
    expect(isDuplicateLink(edges, 'aria', 'order', 'member_of')).toBe(true)
    expect(isDuplicateLink(edges, 'order', 'aria', 'member_of')).toBe(false)
  })
})

describe('loops', () => {
  const tree = [edge('grandma', 'parent_of', 'mum'), edge('mum', 'parent_of', 'aria')]

  it('refuses a link that closes a loop of the same type', () => {
    expect(wouldCreateLoop(tree, 'aria', 'grandma', 'parent_of')).toBe(true)
    expect(wouldCreateLoop(tree, 'aria', 'mum', 'parent_of')).toBe(true)
    expect(wouldCreateLoop(tree, 'aria', 'aria', 'parent_of')).toBe(true)
    expect(wouldCreateLoop([edge('citadel', 'located_in', 'north')], 'north', 'citadel', 'located_in')).toBe(true)
  })

  it('allows branches, other types, and loops in types that may loop', () => {
    expect(wouldCreateLoop(tree, 'grandma', 'aunt', 'parent_of')).toBe(false)
    expect(wouldCreateLoop(tree, 'aria', 'grandma', 'related_to')).toBe(false)
    expect(wouldCreateLoop([edge('a', 'owns', 'b')], 'b', 'a', 'owns')).toBe(false)
  })

  it('ignores loops through other types', () => {
    const mixed = [edge('a', 'located_in', 'b'), edge('b', 'part_of', 'c')]
    expect(wouldCreateLoop(mixed, 'c', 'a', 'located_in')).toBe(false)
  })
})

describe('reading connections', () => {
  const articles = new Map(
    ['aria', 'citadel', 'order', 'bran', 'war'].map((id) => [id, { id, title: id.charAt(0).toUpperCase() + id.slice(1) }]),
  )
  const edges = [
    edge('aria', 'lives_in', 'citadel'),
    edge('aria', 'member_of', 'order'),
    edge('aria', 'participated_in', 'war'),
    edge('aria', 'ally_of', 'bran'),
    edge('bran', 'lives_in', 'citadel'),
    edge('secret', 'enemy_of', 'aria'),
  ]

  it('groups outgoing, incoming and mutual links with labels read from the article', () => {
    const aria = groupConnections('aria', edges, articles)
    expect(aria.map((g) => [g.key, g.label, g.items.map((i) => i.other.id)])).toEqual([
      ['ally_of:mutual', 'ally of', ['bran']],
      ['member_of:outgoing', 'member of', ['order']],
      ['lives_in:outgoing', 'lives in', ['citadel']],
      ['participated_in:outgoing', 'participated in', ['war']],
    ])
    const citadel = groupConnections('citadel', edges, articles)
    expect(citadel).toHaveLength(1)
    expect(citadel[0]).toMatchObject({ key: 'lives_in:incoming', label: 'home of', direction: 'incoming', family: 'geographic' })
    expect(citadel[0].items.map((i) => i.other.title)).toEqual(['Aria', 'Bran'])
    // The mutual link reads the same from the other end.
    expect(groupConnections('bran', edges, articles)[0]).toMatchObject({ key: 'ally_of:mutual', label: 'ally of' })
  })

  it('leaves out links to articles the reader cannot see', () => {
    expect(groupConnections('aria', edges, articles).some((g) => g.type === 'enemy_of')).toBe(false)
  })
})

describe('adding from either end', () => {
  it('offers each type forward, and directed types backward', () => {
    const options = linkOptions()
    expect(options.filter((o) => o.type === 'ally_of').map((o) => o.direction)).toEqual(['outgoing'])
    expect(options.find((o) => o.value === 'lives_in:incoming')).toMatchObject({ label: 'home of' })
    expect(endsFor({ direction: 'incoming' }, 'citadel', 'aria')).toEqual({ fromArticleId: 'aria', toArticleId: 'citadel' })
    expect(endsFor({ direction: 'outgoing' }, 'aria', 'citadel')).toEqual({ fromArticleId: 'aria', toArticleId: 'citadel' })
  })
})

describe('createLinkSchema', () => {
  const id = (c: string) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`
  it('refuses self links and unknown types', () => {
    expect(createLinkSchema.safeParse({ fromArticleId: id('a'), toArticleId: id('b'), type: 'lives_in' }).success).toBe(true)
    expect(createLinkSchema.safeParse({ fromArticleId: id('a'), toArticleId: id('a'), type: 'lives_in' }).success).toBe(false)
    expect(createLinkSchema.safeParse({ fromArticleId: id('a'), toArticleId: id('b'), type: 'married_to' }).success).toBe(false)
  })
})
