/**
 * Data hooks for Mythos screens.
 *
 * Everything here reads through the RecordRoom, which only ever sends rows
 * the caller may read — a universe the caller is not a member of never
 * reaches this code. Roles derived here gate UI only; the DO and server
 * actions enforce them.
 */

import { useMemo } from 'react'
import { useAuth, useQuery, useUsers } from 'deepspace'
import { COLLECTIONS, type UniverseRole } from '../../domain/mythos'
import type {
  ArticleData,
  ArticleLinkData,
  ArticleRevisionData,
  ArticleTagData,
  CategoryData,
  TagData,
  TeamMemberData,
  UniverseData,
} from '../../domain/records'
import { isUniverseRole } from '../../server/mythos/roles'

export type LoadStatus = 'loading' | 'ready' | 'error'

export function combine(...statuses: LoadStatus[]): LoadStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('loading')) return 'loading'
  return 'ready'
}

interface Stamped {
  id: string
  createdAt: string
  updatedAt: string
}

export type UniverseView = UniverseData & Stamped & { role: UniverseRole }
export type ArticleView = ArticleData & Stamped
export type CategoryView = CategoryData & { id: string }
export type LinkView = ArticleLinkData & { id: string }
export type RevisionView = Omit<ArticleRevisionData, 'content'> & Stamped

// ── Membership and universes ──────────────────────────────────────────────

/** The caller's own active memberships, keyed by universe id. */
export function useMyRoles(): { roles: Map<string, UniverseRole>; status: LoadStatus } {
  const { userId } = useAuth()
  const { records, status } = useQuery<TeamMemberData>(COLLECTIONS.teamMembers, {
    where: { UserId: userId ?? '' },
  })
  const roles = useMemo(() => {
    const map = new Map<string, UniverseRole>()
    for (const r of records) {
      if (r.data.Status === 'active' && isUniverseRole(r.data.role)) map.set(r.data.TeamId, r.data.role)
    }
    return map
  }, [records])
  return { roles, status }
}

export function useMyUniverses() {
  const { records, status: universeStatus } = useQuery<UniverseData>(COLLECTIONS.universes, {
    orderBy: 'updatedAt',
    orderDir: 'desc',
  })
  const { roles, status: roleStatus } = useMyRoles()
  const universes = useMemo<UniverseView[]>(
    () =>
      records
        .filter((u) => roles.has(u.recordId))
        .map((u) => ({
          ...u.data,
          id: u.recordId,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          role: roles.get(u.recordId) as UniverseRole,
        })),
    [records, roles],
  )
  return { universes, status: combine(universeStatus, roleStatus) }
}

export function useUniverse(universeId: string) {
  const { records, status: universeStatus } = useQuery<UniverseData>(COLLECTIONS.universes, {
    where: { teamId: universeId },
  })
  const { roles, status: roleStatus } = useMyRoles()
  const u = records[0]
  const role = roles.get(universeId) ?? null
  const universe = useMemo<UniverseView | null>(
    () =>
      u && role
        ? { ...u.data, id: u.recordId, createdAt: u.createdAt, updatedAt: u.updatedAt, role }
        : null,
    [u, role],
  )
  return { universe, role, status: combine(universeStatus, roleStatus) }
}

export interface MemberView {
  membershipId: string
  userId: string
  role: UniverseRole
  name: string
  imageUrl?: string
}

export function useMembers(universeId: string) {
  const { records, status } = useQuery<TeamMemberData>(COLLECTIONS.teamMembers, {
    where: { TeamId: universeId },
  })
  const { users } = useUsers()
  const members = useMemo<MemberView[]>(() => {
    const byId = new Map(users.map((u) => [u.id, u]))
    const order: Record<UniverseRole, number> = { owner: 0, editor: 1, viewer: 2 }
    return records
      .filter((r) => r.data.Status === 'active' && isUniverseRole(r.data.role))
      .map((r) => {
        const user = byId.get(r.data.UserId)
        return {
          membershipId: r.recordId,
          userId: r.data.UserId,
          role: r.data.role,
          name: user?.name || 'Unknown member',
          imageUrl: user?.imageUrl,
        }
      })
      .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name))
  }, [records, users])
  return { members, status }
}

/** id → display name for every user the roster shows. */
export function useUserNames(): Map<string, string> {
  const { users } = useUsers()
  return useMemo(() => new Map(users.map((u) => [u.id, u.name || 'Unknown'])), [users])
}

// ── Articles ──────────────────────────────────────────────────────────────

function toArticle(r: { recordId: string; data: ArticleData; createdAt: string; updatedAt: string }): ArticleView {
  return { ...r.data, id: r.recordId, createdAt: r.createdAt, updatedAt: r.updatedAt }
}

export function useArticles(universeId: string) {
  const { records, status } = useQuery<ArticleData>(COLLECTIONS.articles, {
    where: { universeId },
    orderBy: 'updatedAt',
    orderDir: 'desc',
  })
  const articles = useMemo(() => records.map(toArticle), [records])
  return { articles, status }
}

export function useArticle(universeId: string, articleId: string) {
  const { articles, status } = useArticles(universeId)
  const article = useMemo(() => articles.find((a) => a.id === articleId) ?? null, [articles, articleId])
  return { article, articles, status }
}

/** Articles across every universe the caller can read, most recently changed first (all of them without `limit`). */
export function useRecentArticles(limit?: number) {
  const { records, status } = useQuery<ArticleData>(COLLECTIONS.articles, {
    orderBy: 'updatedAt',
    orderDir: 'desc',
    ...(limit ? { limit } : {}),
  })
  const articles = useMemo(() => records.map(toArticle), [records])
  return { articles, status }
}

// ── Organisation ──────────────────────────────────────────────────────────

export function useCategories(universeId: string) {
  const { records, status } = useQuery<CategoryData>(COLLECTIONS.categories, { where: { universeId } })
  const categories = useMemo<CategoryView[]>(
    () =>
      records
        .map((r) => ({ ...r.data, id: r.recordId }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [records],
  )
  return { categories, status }
}

/** Tags of a universe, plus articleId → tag names. */
export function useTags(universeId: string) {
  const { records: tagRows, status: tagStatus } = useQuery<TagData>(COLLECTIONS.tags, { where: { universeId } })
  const { records: joinRows, status: joinStatus } = useQuery<ArticleTagData>(COLLECTIONS.articleTags, {
    where: { universeId },
  })
  const value = useMemo(() => {
    const tagName = new Map(tagRows.map((t) => [t.recordId, t.data.name]))
    const byArticle = new Map<string, string[]>()
    for (const j of joinRows) {
      const name = tagName.get(j.data.tagId)
      if (!name) continue
      const list = byArticle.get(j.data.articleId) ?? []
      list.push(name)
      byArticle.set(j.data.articleId, list)
    }
    for (const list of byArticle.values()) list.sort((a, b) => a.localeCompare(b))
    const tags = tagRows.map((t) => ({ id: t.recordId, name: t.data.name })).sort((a, b) => a.name.localeCompare(b.name))
    return { tags, byArticle }
  }, [tagRows, joinRows])
  return { ...value, status: combine(tagStatus, joinStatus) }
}

/** Every relationship in a universe. */
export function useLinks(universeId: string) {
  const { records, status } = useQuery<ArticleLinkData>(COLLECTIONS.articleLinks, { where: { universeId } })
  const links = useMemo<LinkView[]>(() => records.map((r) => ({ ...r.data, id: r.recordId })), [records])
  return { links, status }
}

// ── Activity ──────────────────────────────────────────────────────────────

function toRevision(r: { recordId: string; data: ArticleRevisionData; createdAt: string; updatedAt: string }): RevisionView {
  const { content: _content, ...rest } = r.data
  void _content
  return { ...rest, id: r.recordId, createdAt: r.createdAt, updatedAt: r.updatedAt }
}

/** Latest saved versions across every universe the caller can read. */
export function useRecentRevisions(limit = 12) {
  const { records, status } = useQuery<ArticleRevisionData>(COLLECTIONS.articleRevisions, {
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit,
  })
  const revisions = useMemo(() => records.map(toRevision), [records])
  return { revisions, status }
}

/** Saved versions of one article, newest first. */
export function useArticleRevisions(universeId: string, articleId: string) {
  const { records, status } = useQuery<ArticleRevisionData>(COLLECTIONS.articleRevisions, {
    where: { universeId, articleId },
    orderBy: 'number',
    orderDir: 'desc',
  })
  const revisions = useMemo(() => records.map(toRevision), [records])
  return { revisions, status }
}
