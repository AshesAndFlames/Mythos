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
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'
import {
  ARTICLE_STATUSES,
  ARTICLE_TYPES,
  COLLECTIONS,
  LINK_TYPES,
  MEMBER_STATUSES,
  REFERENCE_SOURCES,
  UNIVERSE_ROLES,
  USAGE_KINDS,
} from '../domain/mythos'

const NONE: RolePermissions = { read: false, create: false, update: false, delete: false }
const ADMIN_ALL: RolePermissions = { read: true, create: true, update: true, delete: true }

/** Read-only to universe members; every write goes through a server action. */
const TEAM_READ_ONLY: RolePermissions = { read: 'team', create: false, update: false, delete: false }

export const universesSchema: CollectionSchema = {
  name: COLLECTIONS.universes,
  columns: [
    { name: 'teamId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'tagline', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'description', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'artStyle', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'coverImageKey', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'editorIds', storage: 'text', interpretation: { kind: 'json' } },
  ],
  teamField: 'teamId',
  ownerField: 'ownerId',
  collaboratorsField: 'editorIds',
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
    { name: 'TeamId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'UserId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'Status',
      storage: 'text',
      interpretation: { kind: 'select', options: [...MEMBER_STATUSES] },
      required: true,
    },
    {
      name: 'role',
      storage: 'text',
      interpretation: { kind: 'select', options: [...UNIVERSE_ROLES] },
      required: true,
    },
    { name: 'invitedBy', storage: 'text', interpretation: 'plain', immutable: true },
  ],
  teamField: 'TeamId',
  uniqueOn: ['TeamId', 'UserId'],
  permissions: {
    '*': NONE,
    viewer: NONE,
    member: TEAM_READ_ONLY,
    admin: ADMIN_ALL,
  },
}

export const categoriesSchema: CollectionSchema = {
  name: COLLECTIONS.categories,
  columns: [
    { name: 'universeId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'parentId', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'sortOrder', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  teamField: 'universeId',
  uniqueOn: ['universeId', 'parentId', 'name'],
  permissions: {
    '*': NONE,
    viewer: NONE,
    member: TEAM_READ_ONLY,
    admin: ADMIN_ALL,
  },
}

/** Fields an editor may change directly on an article (the Yjs body is separate). */
export const ARTICLE_CLIENT_WRITABLE_FIELDS = [
  'title',
  'summary',
  'type',
  'infobox',
  'categoryId',
  'tags',
  'status',
  'coverImageKey',
] as const

export const articlesSchema: CollectionSchema = {
  name: COLLECTIONS.articles,
  columns: [
    { name: 'universeId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'slug', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'type',
      storage: 'text',
      interpretation: { kind: 'select', options: [...ARTICLE_TYPES] },
      required: true,
    },
    { name: 'summary', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'infobox', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'categoryId', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'tags', storage: 'text', interpretation: { kind: 'json' } },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: [...ARTICLE_STATUSES] },
      default: 'draft',
    },
    { name: 'coverImageKey', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'editorIds', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'authorId', storage: 'text', interpretation: 'plain', immutable: true },
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

export const articleLinksSchema: CollectionSchema = {
  name: COLLECTIONS.articleLinks,
  columns: [
    { name: 'universeId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'fromArticleId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'toArticleId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'type',
      storage: 'text',
      interpretation: { kind: 'select', options: [...LINK_TYPES] },
      required: true,
    },
    { name: 'note', storage: 'text', interpretation: 'plain', default: '' },
  ],
  teamField: 'universeId',
  uniqueOn: ['fromArticleId', 'toArticleId', 'type'],
  permissions: {
    '*': NONE,
    viewer: NONE,
    member: TEAM_READ_ONLY,
    admin: ADMIN_ALL,
  },
}

export const articleReferencesSchema: CollectionSchema = {
  name: COLLECTIONS.articleReferences,
  columns: [
    { name: 'universeId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'articleId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'source',
      storage: 'text',
      interpretation: { kind: 'select', options: [...REFERENCE_SOURCES] },
      required: true,
    },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'url', storage: 'text', interpretation: { kind: 'url' }, required: true },
    { name: 'excerpt', storage: 'text', interpretation: 'plain', default: '' },
  ],
  teamField: 'universeId',
  uniqueOn: ['articleId', 'url'],
  permissions: {
    '*': NONE,
    viewer: NONE,
    member: TEAM_READ_ONLY,
    admin: ADMIN_ALL,
  },
}

/** Per-user daily spend counters. Written only by server actions. */
export const usageSchema: CollectionSchema = {
  name: COLLECTIONS.usage,
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'day', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'kind',
      storage: 'text',
      interpretation: { kind: 'select', options: [...USAGE_KINDS] },
      required: true,
      immutable: true,
    },
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
  usageSchema,
]
