import { describe, expect, it } from 'vitest'
import { matchesSearch, publishedArticles, visibleCategories, visibleConnections, type ArticleRow } from './public'

const article = (id: string, status: ArticleRow['status'], extra: Partial<ArticleRow> = {}): ArticleRow => ({
  id,
  title: `Title ${id}`,
  type: 'lore',
  summary: '',
  categoryId: '',
  coverImageKey: '',
  status,
  updatedAt: '2026-11-01T00:00:00Z',
  ...extra,
})

describe('publishedArticles', () => {
  it('drops drafts, attaches sorted tags, and orders newest first', () => {
    const rows = [
      article('a', 'published', { updatedAt: '2026-11-01T00:00:00Z' }),
      article('b', 'draft'),
      article('c', 'published', { updatedAt: '2026-11-05T00:00:00Z' }),
    ]
    const out = publishedArticles(rows, new Map([['a', ['war', 'ancient']], ['b', ['secret']]]))
    expect(out.map((a) => a.id)).toEqual(['c', 'a'])
    expect(out[1].tags).toEqual(['ancient', 'war'])
    expect(out[0].tags).toEqual([])
    expect(out[0]).not.toHaveProperty('status')
  })
})

describe('visibleCategories', () => {
  const categories = [
    { id: 'root', name: 'World', parentId: '', sortOrder: 0 },
    { id: 'child', name: 'Cities', parentId: 'root', sortOrder: 0 },
    { id: 'drafts', name: 'Spoilers', parentId: '', sortOrder: 1 },
    { id: 'empty', name: 'Empty', parentId: '', sortOrder: 2 },
  ]

  it('keeps categories holding published articles and their ancestors only', () => {
    const published = publishedArticles(
      [article('a', 'published', { categoryId: 'child' }), article('b', 'draft', { categoryId: 'drafts' })],
      new Map(),
    )
    expect(visibleCategories(categories, published).map((c) => c.id).sort()).toEqual(['child', 'root'])
  })

  it('survives a parent cycle', () => {
    const cyclic = [
      { id: 'x', name: 'X', parentId: 'y', sortOrder: 0 },
      { id: 'y', name: 'Y', parentId: 'x', sortOrder: 0 },
    ]
    const published = publishedArticles([article('a', 'published', { categoryId: 'x' })], new Map())
    expect(visibleCategories(cyclic, published).map((c) => c.id).sort()).toEqual(['x', 'y'])
  })
})

describe('visibleConnections', () => {
  it('keeps only links whose two ends are published', () => {
    const link = (linkId: string, from: string, to: string) => ({ linkId, type: 'ally_of' as const, note: '', fromArticleId: from, toArticleId: to })
    const out = visibleConnections([link('1', 'a', 'b'), link('2', 'a', 'draft'), link('3', 'draft', 'b')], new Set(['a', 'b']))
    expect(out.map((l) => l.linkId)).toEqual(['1'])
  })
})

describe('matchesSearch', () => {
  it('matches name or tagline, case-insensitively; blank matches all', () => {
    const u = { name: 'The Shattered Isles', tagline: 'Pirates and storms' }
    expect(matchesSearch(u, '')).toBe(true)
    expect(matchesSearch(u, 'shattered')).toBe(true)
    expect(matchesSearch(u, 'STORM')).toBe(true)
    expect(matchesSearch(u, 'dragons')).toBe(false)
  })
})
