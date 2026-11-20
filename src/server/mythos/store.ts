/**
 * Typed access to Mythos collections from server actions.
 *
 * All reads here run with RBAC off (server action tools), so every function
 * that takes ids from a caller must be paired with a membership check —
 * see `requireRole` in membership.ts.
 */

import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS } from '../../domain/mythos'
import type { ArticleData, TeamMemberData, UniverseData } from '../../domain/records'

export interface Envelope<T> {
  recordId: string
  data: T
  createdBy?: string
}

export class StoreError extends Error {}

type QueryOptions = { where?: Record<string, unknown>; orderBy?: string; orderDir?: 'asc' | 'desc' }

const PAGE = 200

/**
 * Every record matching `where`, following the DO's `nextOffset` paging.
 * (The SDK's query tool accepts `offset`; ActionTools' type omits it.)
 */
export async function queryAll<T>(
  tools: ActionTools,
  collection: string,
  options: QueryOptions = {},
): Promise<Envelope<T>[]> {
  const out: Envelope<T>[] = []
  let offset = 0
  for (;;) {
    const res = await tools.query(collection, { ...options, limit: PAGE, offset } as QueryOptions & {
      limit: number
    })
    if (!res.success) throw new StoreError(`Could not read ${collection}: ${res.error}`)
    const data = res.data as { records: Envelope<T>[]; nextOffset?: number }
    out.push(...data.records)
    if (data.nextOffset === undefined) return out
    offset = data.nextOffset
  }
}

export async function getRecord<T>(
  tools: ActionTools,
  collection: string,
  recordId: string,
): Promise<Envelope<T> | null> {
  const res = await tools.get(collection, recordId)
  if (!res.success) return null
  const record = (res.data as { record?: Envelope<T> }).record
  return record ?? null
}

export async function mustSucceed<T>(
  promise: Promise<{ success: true; data: T } | { success: false; error: string }>,
  what: string,
): Promise<T> {
  const res = await promise
  if (!res.success) throw new StoreError(`${what} failed: ${res.error}`)
  return res.data
}

export function getUniverse(tools: ActionTools, universeId: string) {
  return getRecord<UniverseData>(tools, COLLECTIONS.universes, universeId)
}

export function getArticle(tools: ActionTools, articleId: string) {
  return getRecord<ArticleData>(tools, COLLECTIONS.articles, articleId)
}

export async function getMembership(
  tools: ActionTools,
  universeId: string,
  userId: string,
): Promise<Envelope<TeamMemberData> | null> {
  const rows = await queryAll<TeamMemberData>(tools, COLLECTIONS.teamMembers, {
    where: { TeamId: universeId, UserId: userId },
  })
  return rows[0] ?? null
}

export function listMemberships(tools: ActionTools, universeId: string) {
  return queryAll<TeamMemberData>(tools, COLLECTIONS.teamMembers, { where: { TeamId: universeId } })
}
