/**
 * What a non-member may see of a public universe (ADR-024): published
 * articles only, plus the categories, tags and connections that touch them.
 * Pure functions over plain rows, used by the public read actions and tested
 * on their own. Everything not returned here stays members-only.
 */

import type { ArticleStatus, ArticleType, LinkType, UniverseRole } from './mythos'

/** A public universe as Explore lists it. */
export interface PublicUniverseSummary {
  id: string
  name: string
  tagline: string
  coverImageKey: string
  ownerName: string
  articleCount: number
  updatedAt: string
  /** The caller's role, when they are already a member. */
  myRole: UniverseRole | null
}

export interface PublicArticleSummary {
  id: string
  title: string
  type: ArticleType
  summary: string
  categoryId: string
  coverImageKey: string
  updatedAt: string
  tags: string[]
}

export interface PublicCategory {
  id: string
  name: string
  parentId: string
  sortOrder: number
}

export interface PublicConnection {
  linkId: string
  type: LinkType
  note: string
  fromArticleId: string
  toArticleId: string
}

/** The fields of a stored row the projections read. */
export interface ArticleRow {
  id: string
  title: string
  type: ArticleType
  summary: string
  categoryId: string
  coverImageKey: string
  status: ArticleStatus
  updatedAt: string
}

export type CategoryRow = PublicCategory

export type LinkRow = PublicConnection

/** Published articles only, with their tag names, most recently changed first. */
export function publishedArticles(
  articles: ArticleRow[],
  tagsByArticle: Map<string, string[]>,
): PublicArticleSummary[] {
  return articles
    .filter((a) => a.status === 'published')
    .map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      summary: a.summary,
      categoryId: a.categoryId,
      coverImageKey: a.coverImageKey,
      updatedAt: a.updatedAt,
      tags: [...(tagsByArticle.get(a.id) ?? [])].sort((x, y) => x.localeCompare(y)),
    }))
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
}

/**
 * Categories that hold a published article, plus their ancestors (so the
 * tree stays whole). A category holding only drafts is not revealed.
 */
export function visibleCategories(categories: CategoryRow[], published: PublicArticleSummary[]): PublicCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const keep = new Set<string>()
  for (const a of published) {
    let id = a.categoryId
    // Bounded walk: a corrupt cycle cannot loop forever.
    for (let depth = 0; id && depth < 20 && !keep.has(id); depth++) {
      const c = byId.get(id)
      if (!c) break
      keep.add(id)
      id = c.parentId
    }
  }
  return categories
    .filter((c) => keep.has(c.id))
    .map(({ id, name, parentId, sortOrder }) => ({ id, name, parentId, sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** Connections whose two ends are both published. */
export function visibleConnections(links: LinkRow[], publishedIds: Set<string>): PublicConnection[] {
  return links
    .filter((l) => publishedIds.has(l.fromArticleId) && publishedIds.has(l.toArticleId))
    .map(({ linkId, type, note, fromArticleId, toArticleId }) => ({ linkId, type, note, fromArticleId, toArticleId }))
}

/** Case-insensitive match on name and tagline, for Explore's search box. */
export function matchesSearch(u: Pick<PublicUniverseSummary, 'name' | 'tagline'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return u.name.toLowerCase().includes(q) || u.tagline.toLowerCase().includes(q)
}
