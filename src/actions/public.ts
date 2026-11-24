/**
 * Public universes (ADR-024): the read path for signed-in non-members, and
 * joining as a viewer.
 *
 * Non-members never get the RecordRoom's live rows (every Mythos collection
 * stays `read: 'team'`). Instead these actions read with the server tools and
 * return a projection: the universe's public details and its published
 * articles, with each article's body taken from its latest saved version.
 * Drafts, unsaved live edits, members, activity, revisions and invitations
 * are never returned. Every action re-checks visibility, so making a universe
 * private takes effect on the next request.
 */

import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS, type UniverseRole } from '../domain/mythos'
import {
  matchesSearch,
  publishedArticles,
  visibleCategories,
  visibleConnections,
  type PublicArticleSummary,
  type PublicUniverseSummary,
} from '../domain/public'
import type {
  ArticleData,
  ArticleLinkData,
  ArticleMediaData,
  ArticleRevisionData,
  ArticleTagData,
  CategoryData,
  InvitationData,
  MediaData,
  RichTextNode,
  TagData,
  UniverseData,
} from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { recordActivity } from '../server/mythos/activity'
import { AccessDenied } from '../server/mythos/membership'
import { isUniverseRole } from '../server/mythos/roles'
import { getMembership, getRecord, getUniverse, queryAll, type Envelope } from '../server/mythos/store'
import { listPublicUniversesSchema, publicArticleSchema, universeIdSchema } from '../server/mythos/validation'
import { joinUniverse } from './members'

/** Public universes Explore returns per request. */
export const EXPLORE_LIMIT = 48

async function myRole(tools: ActionTools, universeId: string, userId: string): Promise<UniverseRole | null> {
  const m = await getMembership(tools, universeId, userId)
  return m?.data.Status === 'active' && isUniverseRole(m.data.role) ? m.data.role : null
}

/**
 * The universe, if the caller may read its public view: it is public, or the
 * caller is a member. Anything else (missing, private) answers the same
 * "not found", so private universes cannot be probed.
 */
async function requirePublicRead(tools: ActionTools, userId: string, universeId: string) {
  const [universe, role] = await Promise.all([getUniverse(tools, universeId), myRole(tools, universeId, userId)])
  if (!universe || (universe.data.visibility !== 'public' && !role)) throw new AccessDenied('Universe not found')
  return { universe, role }
}

async function userName(tools: ActionTools, userId: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(userId)
  if (hit) return hit
  const row = await getRecord<{ name?: string }>(tools, 'users', userId)
  const name = row?.data.name || 'Unknown'
  cache.set(userId, name)
  return name
}

/** articleId → tag names, for one universe. */
async function tagsByArticle(tools: ActionTools, universeId: string): Promise<Map<string, string[]>> {
  const [tags, joins] = await Promise.all([
    queryAll<TagData>(tools, COLLECTIONS.tags, { where: { universeId } }),
    queryAll<ArticleTagData>(tools, COLLECTIONS.articleTags, { where: { universeId } }),
  ])
  const name = new Map(tags.map((t) => [t.recordId, t.data.name]))
  const out = new Map<string, string[]>()
  for (const j of joins) {
    const n = name.get(j.data.tagId)
    if (!n) continue
    out.set(j.data.articleId, [...(out.get(j.data.articleId) ?? []), n])
  }
  return out
}

function articleRows(rows: Envelope<ArticleData>[]) {
  return rows.map((r) => ({
    id: r.recordId,
    title: r.data.title,
    type: r.data.type,
    summary: r.data.summary,
    categoryId: r.data.categoryId,
    coverImageKey: r.data.coverImageKey,
    status: r.data.status,
    updatedAt: r.updatedAt ?? '',
  }))
}

async function publishedIn(tools: ActionTools, universeId: string): Promise<PublicArticleSummary[]> {
  const [articles, tags] = await Promise.all([
    queryAll<ArticleData>(tools, COLLECTIONS.articles, { where: { universeId, status: 'published' } }),
    tagsByArticle(tools, universeId),
  ])
  return publishedArticles(articleRows(articles), tags)
}

/** Public universes, most recently updated first, optionally filtered by name or tagline. */
export const listPublicUniverses = mythosAction(
  'listPublicUniverses',
  listPublicUniversesSchema,
  async ({ userId, params, tools }) => {
    const rows = await queryAll<UniverseData>(tools, COLLECTIONS.universes, { where: { visibility: 'public' } })
    const matching = rows
      .filter((u) => matchesSearch(u.data, params.query ?? ''))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    const page = matching.slice(0, EXPLORE_LIMIT)
    const names = new Map<string, string>()
    const universes: PublicUniverseSummary[] = await Promise.all(
      page.map(async (u) => {
        const [articles, role, ownerName] = await Promise.all([
          queryAll<Pick<ArticleData, 'status'>>(tools, COLLECTIONS.articles, {
            where: { universeId: u.recordId, status: 'published' },
          }),
          myRole(tools, u.recordId, userId),
          userName(tools, u.data.ownerId, names),
        ])
        return {
          id: u.recordId,
          name: u.data.name,
          tagline: u.data.tagline,
          coverImageKey: u.data.coverImageKey,
          ownerName,
          articleCount: articles.length,
          updatedAt: u.updatedAt ?? '',
          myRole: role,
        }
      }),
    )
    return { universes, total: matching.length }
  },
)

/** A public universe's home: details, published articles, and the categories that hold them. */
export const getPublicUniverse = mythosAction(
  'getPublicUniverse',
  universeIdSchema,
  async ({ userId, params, tools }) => {
    const { universe, role } = await requirePublicRead(tools, userId, params.universeId)
    const [articles, categories] = await Promise.all([
      publishedIn(tools, params.universeId),
      queryAll<CategoryData>(tools, COLLECTIONS.categories, { where: { universeId: params.universeId } }),
    ])
    return {
      universe: {
        id: universe.recordId,
        name: universe.data.name,
        tagline: universe.data.tagline,
        description: universe.data.description,
        coverImageKey: universe.data.coverImageKey,
        visibility: universe.data.visibility,
        ownerName: await userName(tools, universe.data.ownerId, new Map()),
        updatedAt: universe.updatedAt ?? '',
      },
      myRole: role,
      articles,
      categories: visibleCategories(
        categories.map((c) => ({ id: c.recordId, ...c.data })),
        articles,
      ),
    }
  },
)

/**
 * One published article of a public universe: its details, the body of its
 * latest saved version, and connections to other published articles.
 */
export const getPublicArticle = mythosAction(
  'getPublicArticle',
  publicArticleSchema,
  async ({ userId, params, tools }) => {
    const { universe, role } = await requirePublicRead(tools, userId, params.universeId)
    const article = await getRecord<ArticleData>(tools, COLLECTIONS.articles, params.articleId)
    if (!article || article.data.universeId !== params.universeId || article.data.status !== 'published') {
      throw new AccessDenied('Article not found')
    }

    const [published, links, latest, categories, attached, gallery] = await Promise.all([
      publishedIn(tools, params.universeId),
      queryAll<ArticleLinkData>(tools, COLLECTIONS.articleLinks, { where: { universeId: params.universeId } }),
      tools.query<Pick<ArticleRevisionData, 'content'> & Record<string, unknown>>(COLLECTIONS.articleRevisions, {
        where: { universeId: params.universeId, articleId: params.articleId },
        orderBy: 'number',
        orderDir: 'desc',
        limit: 1,
      }),
      queryAll<CategoryData>(tools, COLLECTIONS.categories, { where: { universeId: params.universeId } }),
      queryAll<ArticleMediaData>(tools, COLLECTIONS.articleMedia, {
        where: { universeId: params.universeId, articleId: params.articleId },
      }),
      queryAll<MediaData>(tools, COLLECTIONS.media, { where: { universeId: params.universeId } }),
    ])
    if (!latest.success) throw new Error(`Reading the article's versions failed: ${latest.error}`)

    const publishedIds = new Set(published.map((a) => a.id))
    const connections = visibleConnections(
      links
        .filter((l) => l.data.fromArticleId === params.articleId || l.data.toArticleId === params.articleId)
        .map((l) => ({ linkId: l.recordId, ...l.data })),
      publishedIds,
    )
    const summary = published.find((a) => a.id === params.articleId)
    const content: RichTextNode | null = latest.data.records[0]?.data.content ?? null
    const category = categories.find((c) => c.recordId === article.data.categoryId)
    // Only the images attached to this published article; the rest of the gallery stays members-only.
    const galleryById = new Map(gallery.map((m) => [m.recordId, m]))
    const media = attached
      .sort((a, b) => a.data.sortOrder - b.data.sortOrder)
      .flatMap((a) => {
        const m = galleryById.get(a.data.mediaId)
        return m ? [{ id: m.recordId, key: m.data.key, title: m.data.title, caption: m.data.caption, kind: m.data.kind }] : []
      })

    return {
      universe: { id: universe.recordId, name: universe.data.name },
      myRole: role,
      article: {
        id: article.recordId,
        title: article.data.title,
        type: article.data.type,
        summary: article.data.summary,
        coverImageKey: article.data.coverImageKey,
        categoryName: category?.data.name ?? '',
        tags: summary?.tags ?? [],
        authorName: await userName(tools, article.data.authorId, new Map()),
        createdAt: article.createdAt ?? '',
        updatedAt: article.updatedAt ?? '',
        content,
      },
      media,
      connections,
      /** Published articles at the other end of a connection, by id. */
      related: published.filter(
        (a) => a.id !== params.articleId && connections.some((c) => c.fromArticleId === a.id || c.toArticleId === a.id),
      ),
    }
  },
)

/**
 * Joins a public universe as a viewer. A member keeps their role. Someone
 * with a pending invitation is sent to accept it instead, so joining can
 * never cost them the role they were invited with.
 */
export const joinPublicUniverse = mythosAction(
  'joinPublicUniverse',
  universeIdSchema,
  async ({ userId, params, tools, system }) => {
    const universe = await getUniverse(tools, params.universeId)
    const existing = await myRole(tools, params.universeId, userId)
    if (existing) return { universeId: params.universeId, role: existing, joined: false }
    if (!universe || universe.data.visibility !== 'public') throw new AccessDenied('Universe not found')

    const me = await getRecord<{ email?: string }>(tools, 'users', userId)
    const email = (me?.data.email ?? '').trim().toLowerCase()
    if (email) {
      const invited = await queryAll<InvitationData>(tools, COLLECTIONS.invitations, {
        where: { universeId: params.universeId, email, status: 'pending' },
      })
      if (invited.length > 0) {
        throw new UserError('You have an invitation to this universe. Accept it on your dashboard to join with its role.')
      }
    }

    const role = await joinUniverse(tools, system, params.universeId, userId, 'viewer', userId)
    await recordActivity(tools, system, { universeId: params.universeId, kind: 'member_joined', actorId: userId, detail: role })
    return { universeId: params.universeId, role, joined: true }
  },
)
