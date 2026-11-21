/**
 * Data shapes stored under `record.data` for each Mythos collection.
 * The column definitions in src/schemas/mythos-schemas.ts must match these.
 */

import type {
  ArticleStatus,
  ArticleType,
  LinkType,
  UniverseRole,
  UniverseVisibility,
} from './mythos'

export interface UniverseData {
  /** Equals the universe's own recordId; the DO's team id for 'team' reads. */
  teamId: string
  name: string
  /** URL slug, unique per owner. Server-generated from the name. */
  slug: string
  tagline: string
  description: string
  artStyle: string
  coverImageKey: string
  visibility: UniverseVisibility
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
  /** '' or a category in the same universe. Set only by `setArticleCategory`. */
  categoryId: string
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

/** A tag in one universe. Articles link to tags through `article_tags`. */
export interface TagData {
  universeId: string
  name: string
  /** Lower-cased, slugified name; unique per universe. */
  slug: string
}

export interface ArticleTagData {
  universeId: string
  articleId: string
  tagId: string
}

/**
 * Rich-text JSON in ProseMirror/Tiptap form. Validated structurally on the
 * server (src/server/mythos/richtext.ts); node and mark names are not
 * restricted to one editor schema so the editor can evolve.
 */
export interface RichTextMark {
  type: string
  attrs?: Record<string, string | number | boolean | null>
}

export interface RichTextNode {
  type: string
  attrs?: Record<string, string | number | boolean | null>
  content?: RichTextNode[]
  marks?: RichTextMark[]
  text?: string
}

/** A saved version of an article: metadata from the server, body from the editor. */
export interface ArticleRevisionData {
  universeId: string
  articleId: string
  /** 1, 2, 3, … per article. */
  number: number
  title: string
  summary: string
  content: RichTextNode
  /** SHA-256 of title, summary and content; identical saves are skipped. */
  fingerprint: string
  authorId: string
  note: string
}

export interface UsageData {
  userId: string
  day: string
  kind: string
  count: number
}
