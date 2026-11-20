/**
 * Permission matrix for the Mythos collections, evaluated with the SDK's own
 * permission functions — the same `canRead` / `canUpdate` / `canCreate` /
 * `checkFieldPermissions` the RecordRoom calls before it persists a write,
 * broadcasts a row, or applies a Yjs update to a record field.
 *
 * Team membership is supplied through the permission context, exactly as the
 * RecordRoom resolves it from `team_members`.
 */

import { describe, expect, it } from 'vitest'
import {
  canCreate,
  canDelete,
  canRead,
  canUpdate,
  checkFieldPermissions,
  lintSchema,
} from 'deepspace/worker'
import type { CollectionSchema } from 'deepspace/schema'
import { schemas } from '../schemas'
import {
  articleLinksSchema,
  articlesSchema,
  categoriesSchema,
  mythosSchemas,
  teamMembersSchema,
  universesSchema,
  usageSchema,
} from './mythos-schemas'

const UNIVERSE_A = 'uni-a'
const UNIVERSE_B = 'uni-b'
const OWNER = 'user-owner'
const EDITOR = 'user-editor'
const VIEWER = 'user-viewer'
const OUTSIDER = 'user-outsider'
const SYSTEM = 'user-app-owner'

/** Active memberships: universe A has owner, editor, viewer; B has only the outsider. */
const memberships: Record<string, string[]> = {
  [UNIVERSE_A]: [OWNER, EDITOR, VIEWER],
  [UNIVERSE_B]: [OUTSIDER],
}
const ctx = {
  isTeamMember: (teamId: string, userId: string) => memberships[teamId]?.includes(userId) ?? false,
}

/** A row as the server actions create it: authored by the system identity. */
function row(data: Record<string, unknown>, recordId = 'rec-1') {
  return { recordId, data, createdBy: SYSTEM, createdAt: '', updatedAt: '' }
}

const articleInA = row({
  universeId: UNIVERSE_A,
  title: 'Aria',
  slug: 'aria',
  type: 'character',
  ownerId: OWNER,
  editorIds: [OWNER, EDITOR],
})

// App role for every signed-in Mythos user. Universe roles live in team_members.
const MEMBER = 'member'

describe('schema lint', () => {
  it.each(mythosSchemas.map((s) => [s.name, s] as const))('%s has no lint warnings', (_n, s) => {
    expect(lintSchema(s as CollectionSchema)).toEqual([])
  })

  it('registers every Mythos collection, including team_members', () => {
    const names = schemas.map((s) => s.name)
    for (const s of mythosSchemas) expect(names).toContain(s.name)
  })
})

describe('articles: read isolation', () => {
  it.each([OWNER, EDITOR, VIEWER])('%s (member of A) can read an article in A', (user) => {
    expect(canRead(articlesSchema, MEMBER, articleInA, user, ctx)).toBe(true)
  })

  it('an outsider cannot read an article in another universe', () => {
    expect(canRead(articlesSchema, MEMBER, articleInA, OUTSIDER, ctx)).toBe(false)
  })

  it('anonymous and app-level viewers get nothing', () => {
    expect(canRead(articlesSchema, '*', articleInA, '', ctx)).toBe(false)
    expect(canRead(articlesSchema, 'viewer', articleInA, VIEWER, ctx)).toBe(false)
  })

  it('a removed member loses access immediately', () => {
    const afterRemoval = {
      isTeamMember: (teamId: string, userId: string) =>
        teamId === UNIVERSE_A && userId !== EDITOR && ctx.isTeamMember(teamId, userId),
    }
    const withoutEditor = row({ ...articleInA.data, editorIds: [OWNER] })
    expect(canRead(articlesSchema, MEMBER, withoutEditor, EDITOR, afterRemoval)).toBe(false)
  })
})

describe('articles: editor vs viewer (fields and Yjs body share this check)', () => {
  it('the universe owner can update', () => {
    expect(canUpdate(articlesSchema, MEMBER, articleInA, OWNER, ctx)).toBe(true)
  })

  it('an editor can update', () => {
    expect(canUpdate(articlesSchema, MEMBER, articleInA, EDITOR, ctx)).toBe(true)
  })

  it('a viewer cannot update', () => {
    expect(canUpdate(articlesSchema, MEMBER, articleInA, VIEWER, ctx)).toBe(false)
  })

  it('an outsider cannot update', () => {
    expect(canUpdate(articlesSchema, MEMBER, articleInA, OUTSIDER, ctx)).toBe(false)
  })

  it('clients can never create or delete articles directly', () => {
    expect(canCreate(articlesSchema, MEMBER)).toBe(false)
    expect(canDelete(articlesSchema, MEMBER, articleInA, OWNER, ctx)).toBe(false)
  })
})

describe('articles: protected fields', () => {
  const existing = articleInA.data

  it('an editor may change content fields', () => {
    expect(
      checkFieldPermissions(articlesSchema, MEMBER, { summary: 'A knight', tags: ['order'] }, existing),
    ).toBeNull()
  })

  it.each(['editorIds', 'universeId', 'ownerId', 'slug', 'authorId'])(
    'a client cannot change %s',
    (field) => {
      const value = field === 'editorIds' ? [OWNER, EDITOR, VIEWER] : 'forged'
      expect(checkFieldPermissions(articlesSchema, MEMBER, { [field]: value }, existing)).toMatch(
        /cannot modify field/,
      )
    },
  )
})

describe('universe-owned collections are read-only to clients', () => {
  const cases: Array<[string, CollectionSchema, Record<string, unknown>]> = [
    ['universes', universesSchema, { teamId: UNIVERSE_A, ownerId: OWNER, editorIds: [OWNER, EDITOR] }],
    ['team_members', teamMembersSchema, { TeamId: UNIVERSE_A, UserId: EDITOR, role: 'editor' }],
    ['categories', categoriesSchema, { universeId: UNIVERSE_A, name: 'Kingdoms' }],
    ['article_links', articleLinksSchema, { universeId: UNIVERSE_A, fromArticleId: 'a', toArticleId: 'b' }],
  ]

  it.each(cases)('%s: members read, outsiders do not', (_n, schema, data) => {
    const r = row(data)
    expect(canRead(schema, MEMBER, r, VIEWER, ctx)).toBe(true)
    expect(canRead(schema, MEMBER, r, OUTSIDER, ctx)).toBe(false)
  })

  it.each(cases)('%s: no client create, update or delete — even for the owner', (_n, schema, data) => {
    const r = row(data)
    expect(canCreate(schema, MEMBER)).toBe(false)
    expect(canUpdate(schema, MEMBER, r, OWNER, ctx)).toBe(false)
    expect(canDelete(schema, MEMBER, r, OWNER, ctx)).toBe(false)
  })

  it('nobody can add themselves to a universe', () => {
    expect(canCreate(teamMembersSchema, MEMBER)).toBe(false)
  })
})

describe('usage counters', () => {
  it('are invisible to members', () => {
    const r = row({ userId: EDITOR, day: '2026-11-20', kind: 'image', count: 1 })
    expect(canRead(usageSchema, MEMBER, r, EDITOR, ctx)).toBe(false)
    expect(canCreate(usageSchema, MEMBER)).toBe(false)
  })
})
