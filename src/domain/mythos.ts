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
  other: 'Other',
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

export const LINK_TYPES = [
  'related_to',
  'ally_of',
  'enemy_of',
  'parent_of',
  'sibling_of',
  'spouse_of',
  'member_of',
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

/** Label read from the link's source, and the inverse label read from its target. */
export const LINK_LABELS: Record<LinkType, { forward: string; inverse: string }> = {
  related_to: { forward: 'related to', inverse: 'related to' },
  ally_of: { forward: 'ally of', inverse: 'ally of' },
  enemy_of: { forward: 'enemy of', inverse: 'enemy of' },
  parent_of: { forward: 'parent of', inverse: 'child of' },
  sibling_of: { forward: 'sibling of', inverse: 'sibling of' },
  spouse_of: { forward: 'spouse of', inverse: 'spouse of' },
  member_of: { forward: 'member of', inverse: 'has member' },
  leads: { forward: 'leads', inverse: 'led by' },
  located_in: { forward: 'located in', inverse: 'contains' },
  part_of: { forward: 'part of', inverse: 'includes' },
  born_in: { forward: 'born in', inverse: 'birthplace of' },
  created: { forward: 'created', inverse: 'created by' },
  owns: { forward: 'owns', inverse: 'owned by' },
  participated_in: { forward: 'participated in', inverse: 'participant' },
  instance_of: { forward: 'is a', inverse: 'example' },
  preceded: { forward: 'preceded', inverse: 'followed' },
}

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
  linkNote: 500,
  slug: 120,
} as const

/** Collection names, kept in one place so worker and client agree. */
export const COLLECTIONS = {
  universes: 'universes',
  teamMembers: 'team_members',
  categories: 'categories',
  articles: 'articles',
  articleLinks: 'article_links',
  articleReferences: 'article_references',
  usage: 'usage',
} as const
