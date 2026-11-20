/**
 * Data shapes stored under `record.data` for each Mythos collection.
 * The column definitions in src/schemas/mythos-schemas.ts must match these.
 */

import type { ArticleStatus, ArticleType, LinkType, UniverseRole } from './mythos'

export interface UniverseData {
  /** Equals the universe's own recordId; the DO's team id for 'team' reads. */
  teamId: string
  name: string
  tagline: string
  description: string
  artStyle: string
  coverImageKey: string
  ownerId: string
  /** Server-maintained: owner plus editors. Drives `update: 'collaborator'`. */
  editorIds: string[]
}

/**
 * Membership row. `TeamId`, `UserId` and `Status` use the SDK's exact
 * spelling: the RecordRoom reads `record.data.UserId` to resubscribe a member's
 * live connection when their membership changes (see ADR-016).
 */
export interface TeamMemberData {
  TeamId: string
  UserId: string
  Status: 'active' | 'removed'
  role: UniverseRole
  invitedBy: string
}

export interface InfoboxEntry {
  key: string
  value: string
}

export interface ArticleData {
  universeId: string
  title: string
  slug: string
  type: ArticleType
  summary: string
  infobox: InfoboxEntry[]
  categoryId: string
  tags: string[]
  status: ArticleStatus
  coverImageKey: string
  editorIds: string[]
  ownerId: string
  authorId: string
}

export interface CategoryData {
  universeId: string
  name: string
  parentId: string
  sortOrder: number
}

export interface ArticleLinkData {
  universeId: string
  fromArticleId: string
  toArticleId: string
  type: LinkType
  note: string
}

export interface ArticleReferenceData {
  universeId: string
  articleId: string
  source: 'wikipedia' | 'web' | 'manual'
  title: string
  url: string
  excerpt: string
}

export interface UsageData {
  userId: string
  day: string
  kind: string
  count: number
}
