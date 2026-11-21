/**
 * Mythos domain constants: the single source of truth for enums and limits.
 *
 * Imported by schemas (select options), Zod validation (server actions), and
 * the UI. Runtime-neutral: no browser or worker imports.
 */

export const ARTICLE_TYPES = [
  'character',
  'location',
  'faction',
  'event',
  'species',
  'item',
  'lore',
  'culture',
  'other',
] as const
export type ArticleType = (typeof ARTICLE_TYPES)[number]

export const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = {
  character: 'Character',
  location: 'Location',
  faction: 'Faction',
  event: 'Event',
  species: 'Species',
  item: 'Item',
  lore: 'Lore',
  culture: 'Culture',
  other: 'General',
}

export const ARTICLE_STATUSES = ['draft', 'published'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

/** Roles inside one universe. Ordered from least to most privileged. */
export const UNIVERSE_ROLES = ['viewer', 'editor', 'owner'] as const
export type UniverseRole = (typeof UNIVERSE_ROLES)[number]
/** Roles an owner can assign through the members UI. */
export const ASSIGNABLE_ROLES = ['editor', 'viewer'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export const MEMBER_STATUSES = ['active', 'removed'] as const

/**
 * Universe visibility. Only 'private' exists today: Mythos is a members-only
 * app (ADR-010). Public universes need their own read path (ADR-017).
 */
export const UNIVERSE_VISIBILITIES = ['private'] as const
export type UniverseVisibility = (typeof UNIVERSE_VISIBILITIES)[number]

export const LINK_TYPES = [
  'related_to',
  'ally_of',
  'enemy_of',
  'parent_of',
  'sibling_of',
  'spouse_of',
  'member_of',
  'lives_in',
  'leads',
  'located_in',
  'part_of',
  'born_in',
  'created',
  'owns',
  'participated_in',
  'instance_of',
  'preceded',
] as const
export type LinkType = (typeof LINK_TYPES)[number]

export const REFERENCE_SOURCES = ['wikipedia', 'web', 'manual'] as const
export const USAGE_KINDS = ['ai_text', 'ai_chat', 'image', 'research'] as const
export type UsageKind = (typeof USAGE_KINDS)[number]

export const LIMITS = {
  universeName: 120,
  universeTagline: 200,
  universeDescription: 5000,
  artStyle: 300,
  articleTitle: 200,
  articleSummary: 1000,
  infoboxEntries: 30,
  infoboxKey: 60,
  infoboxValue: 500,
  tags: 20,
  tag: 40,
  categoryName: 80,
  categoryDepth: 5,
  linkNote: 500,
  slug: 120,
  /** Universes one user may own. */
  universesPerOwner: 25,
  /** Oldest revisions beyond this are pruned when a new one is saved. */
  revisionsPerArticle: 50,
  revisionNote: 200,
  /** Serialized size cap for one rich-text snapshot (UTF-16 code units). */
  richTextChars: 200_000,
  richTextDepth: 40,
  richTextNodes: 20_000,
} as const

/** Collection names, kept in one place so worker and client agree. */
export const COLLECTIONS = {
  universes: 'universes',
  teamMembers: 'team_members',
  categories: 'categories',
  articles: 'articles',
  articleLinks: 'article_links',
  articleReferences: 'article_references',
  articleRevisions: 'article_revisions',
  tags: 'tags',
  articleTags: 'article_tags',
  usage: 'usage',
} as const

/**
 * Cover images live in the app-scope file store under keys Mythos chooses:
 * `covers/<uuid>.<ext>`. Keys are validated against this pattern on the
 * server (Zod) and again before rendering, so a stored value can never turn
 * into an arbitrary URL.
 */
export const COVER_KEY_PATTERN = /^covers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/
export const COVER_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const COVER_MAX_BYTES = 5 * 1024 * 1024

/**
 * Same-origin URL for a validated cover key, or null. The file store keeps
 * app-scope files under `apps/<appId>/` and serves them only by that full
 * key, while Mythos stores the short key it chose.
 */
export function coverUrl(key: string | null | undefined, appId: string): string | null {
  if (!key || !COVER_KEY_PATTERN.test(key) || !/^[A-Za-z0-9_-]+$/.test(appId)) return null
  const full = `apps/${appId}/${key}`
  return `/api/files/${full.split('/').map(encodeURIComponent).join('/')}?scope=app`
}
