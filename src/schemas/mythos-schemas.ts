/**
 * Mythos collections. The canonical description is docs/DATABASE_SCHEMA.md.
 *
 * Security model in brief:
 *  - Universe-owned rows carry the universe id in their `teamField`, and
 *    `read: 'team'` makes the RecordRoom send them only to active members
 *    (rows in `team_members`).
 *  - Editor vs. viewer is `update: 'collaborator'` against `editorIds`, a list
 *    that only server actions maintain (`writableFields` keeps clients out).
 *  - `create: false` everywhere for clients: `create` cannot check universe
 *    membership, so every create goes through a server action that does.
 *  - Server actions create these rows under the app's system identity, never
 *    the caller's: the DO's 'team' read query also admits a row's creator, and
 *    a removed member must not keep reading what they once created.
 *  - Cross-record references (an article's category, a link's endpoints, a
 *    tag join, a revision) are written only by actions, which check that both
 *    records belong to the same universe. No client-writable field holds a
 *    record id.
 *  - Plain-text columns carry `maxLength`, so the DO rejects oversized values
 *    even if a write path forgets to validate (Zod in actions is the first
 *    line). JSON columns cannot: the DO rejects any non-string under maxLength.
 *
 * The SDK builds a unique index for each `uniqueOn`; it has no other index
 * configuration (ADR-017).
 */

import type { CollectionSchema, ColumnDefinition, RolePermissions } from 'deepspace/schema'
import {
  ARTICLE_STATUSES,
  ARTICLE_TYPES,
  COLLECTIONS,
  LIMITS,
  LINK_TYPES,
  MEMBER_STATUSES,
  REFERENCE_SOURCES,
  UNIVERSE_ROLES,
  UNIVERSE_VISIBILITIES,
  USAGE_KINDS,
} from '../domain/mythos'

const NONE: RolePermissions = { read: false, create: false, update: false, delete: false }
const ADMIN_ALL: RolePermissions = { read: true, create: true, update: true, delete: true }

/** Read-only to universe members; every write goes through a server action. */
const TEAM_READ_ONLY: RolePermissions = { read: 'team', create: false, update: false, delete: false }

/** The usual permission block for a universe-owned, action-written collection. */
const UNIVERSE_OWNED = { '*': NONE, viewer: NONE, member: TEAM_READ_ONLY, admin: ADMIN_ALL }

/** Record ids (UUIDs or SDK ids) are short; this bounds every id column. */
const ID_MAX = 100

/** A text column. `id` columns are bounded by ID_MAX. */
function text(
  name: string,
  maxLength: number,
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition {
  return { name, storage: 'text', interpretation: 'plain', maxLength, ...extra }
}

function idColumn(name: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return text(name, ID_MAX, { required: true, immutable: true, ...extra })
}

function select(name: string, options: readonly string[], extra: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, storage: 'text', interpretation: { kind: 'select', options: [...options] }, ...extra }
}

export const universesSchema: CollectionSchema = {
  name: COLLECTIONS.universes,
  columns: [
    idColumn('teamId'),
    text('name', LIMITS.universeName, { required: true }),
    text('slug', LIMITS.slug, { default: '' }),
    text('tagline', LIMITS.universeTagline, { default: '' }),
    text('description', LIMITS.universeDescription, { default: '' }),
    text('artStyle', LIMITS.artStyle, { default: '' }),
    text('coverImageKey', 300, { default: '' }),
    select('visibility', UNIVERSE_VISIBILITIES, { default: 'private' }),
    idColumn('ownerId'),
    { name: 'editorIds', storage: 'text', interpretation: { kind: 'json' } },
  ],
  teamField: 'teamId',
  ownerField: 'ownerId',
  collaboratorsField: 'editorIds',
  // Slugs are unique per owner, so choosing one never reveals another user's universes.
  uniqueOn: ['ownerId', 'slug'],
  permissions: {
    '*': NONE,
    viewer: NONE,
    // Settings edits are owner-only and go through `updateUniverse`.
    member: TEAM_READ_ONLY,
    admin: ADMIN_ALL,
  },
}

export const teamMembersSchema: CollectionSchema = {
  name: COLLECTIONS.teamMembers,
  columns: [
    idColumn('TeamId'),
    idColumn('UserId'),
    select('Status', MEMBER_STATUSES, { required: true }),
    select('role', UNIVERSE_ROLES, { required: true }),
    idColumn('invitedBy', { required: false }),
  ],
  teamField: 'TeamId',
  uniqueOn: ['TeamId', 'UserId'],
  permissions: UNIVERSE_OWNED,
}

export const categoriesSchema: CollectionSchema = {
  name: COLLECTIONS.categories,
  columns: [
    idColumn('universeId'),
    text('name', LIMITS.categoryName, { required: true }),
    text('parentId', ID_MAX, { default: '' }),
    { name: 'sortOrder', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  teamField: 'universeId',
  uniqueOn: ['universeId', 'parentId', 'name'],
  permissions: UNIVERSE_OWNED,
}

/**
 * Fields an editor may change directly on an article (the Yjs body is
 * separate). Each is plain text bounded by `maxLength` or a select the DO
 * validates. `title` (slug uniqueness), `categoryId` (same-universe check),
 * `infobox` (JSON, needs Zod) and tags change through actions.
 */
export const ARTICLE_CLIENT_WRITABLE_FIELDS = [
  'summary',
  'type',
  'status',
  'coverImageKey',
] as const

export const articlesSchema: CollectionSchema = {
  name: COLLECTIONS.articles,
  columns: [
    idColumn('universeId'),
    text('title', LIMITS.articleTitle, { required: true }),
    text('slug', LIMITS.slug, { required: true }),
    select('type', ARTICLE_TYPES, { required: true }),
    text('summary', LIMITS.articleSummary, { default: '' }),
    // JSON columns cannot take `maxLength` (the DO applies it to plain text
    // only), so infobox is written only by `setArticleInfobox` (Zod-bounded).
    { name: 'infobox', storage: 'text', interpretation: { kind: 'json' } },
    text('categoryId', ID_MAX, { default: '' }),
    select('status', ARTICLE_STATUSES, { default: 'draft' }),
    text('coverImageKey', 300, { default: '' }),
    { name: 'editorIds', storage: 'text', interpretation: { kind: 'json' } },
    idColumn('ownerId'),
    idColumn('authorId', { required: false }),
  ],
  teamField: 'universeId',
  ownerField: 'ownerId',
  collaboratorsField: 'editorIds',
  uniqueOn: ['universeId', 'slug'],
  permissions: {
    '*': NONE,
    viewer: NONE,
    member: {
      read: 'team',
      create: false,
      update: 'collaborator',
      delete: false,
      writableFields: [...ARTICLE_CLIENT_WRITABLE_FIELDS],
    },
    admin: ADMIN_ALL,
  },
}

/** Typed, directed relationships between two articles of the same universe. */
export const articleLinksSchema: CollectionSchema = {
  name: COLLECTIONS.articleLinks,
  columns: [
    idColumn('universeId'),
    idColumn('fromArticleId'),
    idColumn('toArticleId'),
    select('type', LINK_TYPES, { required: true }),
    text('note', LIMITS.linkNote, { default: '' }),
  ],
  teamField: 'universeId',
  uniqueOn: ['fromArticleId', 'toArticleId', 'type'],
  permissions: UNIVERSE_OWNED,
}

export const articleReferencesSchema: CollectionSchema = {
  name: COLLECTIONS.articleReferences,
  columns: [
    idColumn('universeId'),
    idColumn('articleId'),
    select('source', REFERENCE_SOURCES, { required: true }),
    text('title', 300, { required: true }),
    { name: 'url', storage: 'text', interpretation: { kind: 'url' }, required: true, maxLength: 2000 },
    text('excerpt', 2000, { default: '' }),
  ],
  teamField: 'universeId',
  uniqueOn: ['articleId', 'url'],
  permissions: UNIVERSE_OWNED,
}

/**
 * Saved article versions. Every column is immutable: an action creates a
 * revision; deleting the article (or pruning old versions) removes it;
 * nothing edits one.
 */
export const articleRevisionsSchema: CollectionSchema = {
  name: COLLECTIONS.articleRevisions,
  columns: [
    idColumn('universeId'),
    idColumn('articleId'),
    { name: 'number', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    text('title', LIMITS.articleTitle, { required: true, immutable: true }),
    text('summary', LIMITS.articleSummary, { default: '', immutable: true }),
    {
      name: 'content',
      storage: 'text',
      interpretation: { kind: 'json' },
      required: true,
      immutable: true,
      // Size is bounded by richTextDocSchema (LIMITS.richTextChars) in saveRevision.
    },
    text('fingerprint', 64, { required: true, immutable: true }),
    idColumn('authorId'),
    text('note', LIMITS.revisionNote, { default: '', immutable: true }),
  ],
  teamField: 'universeId',
  uniqueOn: ['articleId', 'number'],
  permissions: UNIVERSE_OWNED,
}

export const tagsSchema: CollectionSchema = {
  name: COLLECTIONS.tags,
  columns: [
    idColumn('universeId'),
    text('name', LIMITS.tag, { required: true }),
    text('slug', LIMITS.tag, { required: true }),
  ],
  teamField: 'universeId',
  uniqueOn: ['universeId', 'slug'],
  permissions: UNIVERSE_OWNED,
}

/** Article ↔ tag joins. Actions check that both ends share `universeId`. */
export const articleTagsSchema: CollectionSchema = {
  name: COLLECTIONS.articleTags,
  columns: [idColumn('universeId'), idColumn('articleId'), idColumn('tagId')],
  teamField: 'universeId',
  uniqueOn: ['articleId', 'tagId'],
  permissions: UNIVERSE_OWNED,
}

/** Per-user daily spend counters. Written only by server actions. */
export const usageSchema: CollectionSchema = {
  name: COLLECTIONS.usage,
  columns: [
    idColumn('userId'),
    text('day', 10, { required: true, immutable: true }),
    select('kind', USAGE_KINDS, { required: true, immutable: true }),
    { name: 'count', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  uniqueOn: ['userId', 'day', 'kind'],
  permissions: {
    '*': NONE,
    viewer: NONE,
    member: NONE,
    admin: { read: true, create: false, update: false, delete: true },
  },
}

export const mythosSchemas: CollectionSchema[] = [
  universesSchema,
  teamMembersSchema,
  categoriesSchema,
  articlesSchema,
  articleLinksSchema,
  articleReferencesSchema,
  articleRevisionsSchema,
  tagsSchema,
  articleTagsSchema,
  usageSchema,
]
