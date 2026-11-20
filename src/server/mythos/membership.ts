/**
 * Universe authorization for server actions.
 *
 * Server actions bypass collection RBAC, so this is the check that stands in
 * for it: the caller's own `team_members` row, read server-side from the
 * verified `userId`, decides what they may do in a universe.
 */

import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS, type UniverseRole } from '../../domain/mythos'
import type { ArticleData, UniverseData } from '../../domain/records'
import { computeEditorIds, hasAtLeast, isUniverseRole, sameIds } from './roles'
import { getMembership, getUniverse, listMemberships, queryAll, type Envelope } from './store'

export class AccessDenied extends Error {}

export interface UniverseAccess {
  universe: Envelope<UniverseData>
  role: UniverseRole
}

/**
 * Loads the universe and the caller's active role in it, and refuses unless
 * the role is at least `minimum`. A universe the caller cannot see answers
 * exactly like one that does not exist, so ids cannot be probed.
 */
export async function requireRole(
  tools: ActionTools,
  userId: string,
  universeId: string,
  minimum: UniverseRole,
): Promise<UniverseAccess> {
  const [universe, membership] = await Promise.all([
    getUniverse(tools, universeId),
    getMembership(tools, universeId, userId),
  ])
  const role = membership?.data.Status === 'active' ? membership.data.role : null
  if (!universe || !isUniverseRole(role)) throw new AccessDenied('Universe not found')
  if (!hasAtLeast(role, minimum)) {
    throw new AccessDenied(
      minimum === 'owner'
        ? 'Only the universe owner can do that'
        : 'You need editor access in this universe to do that',
    )
  }
  return { universe, role }
}

/** Recomputes a universe's editor list from its memberships. */
export async function currentEditorIds(tools: ActionTools, universeId: string): Promise<string[]> {
  const members = await listMemberships(tools, universeId)
  return computeEditorIds(
    members
      .filter((m) => isUniverseRole(m.data.role))
      .map((m) => ({ userId: m.data.UserId, role: m.data.role, active: m.data.Status === 'active' })),
  )
}

/**
 * Writes `editorIds` to the universe and every article in it, skipping rows
 * that already hold the same list. This is what turns a role change into
 * DO-enforced edit rights (articles use `update: 'collaborator'`).
 */
export async function fanOutEditorIds(
  tools: ActionTools,
  universeId: string,
  editorIds: string[],
): Promise<void> {
  const universe = await getUniverse(tools, universeId)
  if (universe && !sameIds(universe.data.editorIds, editorIds)) {
    const res = await tools.update(COLLECTIONS.universes, universeId, { editorIds })
    if (!res.success) throw new Error(`Updating universe editors failed: ${res.error}`)
  }
  const articles = await queryAll<ArticleData>(tools, COLLECTIONS.articles, {
    where: { universeId },
  })
  for (const article of articles) {
    if (sameIds(article.data.editorIds, editorIds)) continue
    const res = await tools.update(COLLECTIONS.articles, article.recordId, { editorIds })
    if (!res.success) throw new Error(`Updating article editors failed: ${res.error}`)
  }
}
