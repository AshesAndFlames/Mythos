/**
 * Data hooks for universes, memberships and articles.
 *
 * Everything here reads through the RecordRoom, which only ever sends rows
 * the caller may read — a universe the caller is not a member of never
 * reaches this code. Roles derived here gate UI only; the DO and server
 * actions enforce them.
 */

import { useMemo } from 'react'
import { useAuth, useQuery, useUsers } from 'deepspace'
import { COLLECTIONS, type UniverseRole } from '../../domain/mythos'
import type { ArticleData, TeamMemberData, UniverseData } from '../../domain/records'
import { isUniverseRole } from '../../server/mythos/roles'

export type LoadStatus = 'loading' | 'ready' | 'error'

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
  const universes = useMemo(
    () =>
      records
        .filter((u) => roles.has(u.recordId))
        .map((u) => ({ id: u.recordId, ...u.data, role: roles.get(u.recordId) as UniverseRole })),
    [records, roles],
  )
  return { universes, status: combine(universeStatus, roleStatus) }
}

export function useUniverse(universeId: string) {
  const { records, status: universeStatus } = useQuery<UniverseData>(COLLECTIONS.universes, {
    where: { teamId: universeId },
  })
  const { roles, status: roleStatus } = useMyRoles()
  const universe = records[0]
  return {
    universe: universe ? { id: universe.recordId, ...universe.data } : null,
    role: roles.get(universeId) ?? null,
    status: combine(universeStatus, roleStatus),
  }
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

export function useArticles(universeId: string) {
  const { records, status } = useQuery<ArticleData>(COLLECTIONS.articles, {
    where: { universeId },
    orderBy: 'updatedAt',
    orderDir: 'desc',
  })
  const articles = useMemo(() => records.map((r) => ({ id: r.recordId, ...r.data })), [records])
  return { articles, status }
}

export function useArticle(universeId: string, articleId: string) {
  const { articles, status } = useArticles(universeId)
  const article = useMemo(() => articles.find((a) => a.id === articleId) ?? null, [articles, articleId])
  return { article, status }
}

function combine(a: LoadStatus, b: LoadStatus): LoadStatus {
  if (a === 'error' || b === 'error') return 'error'
  if (a === 'loading' || b === 'loading') return 'loading'
  return 'ready'
}
