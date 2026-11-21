/**
 * The Mythos relationship model: what each link type means, and pure graph
 * helpers shared by the server (validation), the UI (Connections) and, later,
 * graph views (family trees, alliances, maps, timelines).
 *
 * A link is a directed edge `from —type→ to` inside one universe. Each type
 * declares:
 * - `forward` / `inverse`: how it reads from the source and from the target
 *   ("Aria lives in Silver Citadel" / "Silver Citadel is home of Aria").
 * - `symmetric`: direction carries no meaning (ally of, sibling of). Stored in
 *   one canonical direction so "A ally of B" and "B ally of A" are the same
 *   record, and the collection's unique rule blocks the duplicate.
 * - `acyclic`: the type forms a hierarchy or an order that must never loop
 *   (ancestry, places inside places, what came before what). The server
 *   refuses a link that would close a loop.
 * - `family`: the facet a future visualization draws from it.
 *
 * Runtime-neutral: no browser or worker imports.
 */

import { LINK_TYPES, type LinkType } from './mythos'

export type RelationshipFamily =
  | 'general'
  | 'kinship'
  | 'political'
  | 'membership'
  | 'geographic'
  | 'historical'
  | 'possession'
  | 'classification'

export interface LinkTypeMeta {
  forward: string
  inverse: string
  symmetric: boolean
  acyclic: boolean
  family: RelationshipFamily
  /** Shown when a link would close a loop (acyclic types only). */
  loopMessage?: string
}

const sym = (label: string, family: RelationshipFamily): LinkTypeMeta => ({
  forward: label,
  inverse: label,
  symmetric: true,
  acyclic: false,
  family,
})
const dir = (forward: string, inverse: string, family: RelationshipFamily, loopMessage?: string): LinkTypeMeta => ({
  forward,
  inverse,
  symmetric: false,
  acyclic: loopMessage !== undefined,
  family,
  ...(loopMessage ? { loopMessage } : {}),
})

export const LINK_TYPE_META: Record<LinkType, LinkTypeMeta> = {
  related_to: sym('related to', 'general'),
  ally_of: sym('ally of', 'political'),
  enemy_of: sym('enemy of', 'political'),
  parent_of: dir('parent of', 'child of', 'kinship', 'That would make someone their own ancestor.'),
  sibling_of: sym('sibling of', 'kinship'),
  spouse_of: sym('spouse of', 'kinship'),
  member_of: dir('member of', 'has member', 'membership'),
  lives_in: dir('lives in', 'home of', 'geographic'),
  leads: dir('leads', 'led by', 'political'),
  located_in: dir('located in', 'contains', 'geographic', 'That would place somewhere inside itself.'),
  part_of: dir('part of', 'includes', 'membership', 'That would make something part of itself.'),
  born_in: dir('born in', 'birthplace of', 'geographic'),
  created: dir('created', 'created by', 'possession'),
  owns: dir('owns', 'owned by', 'possession'),
  participated_in: dir('participated in', 'participant', 'historical'),
  instance_of: dir('is a', 'example', 'classification', 'That would make a kind of thing an example of itself.'),
  preceded: dir('preceded', 'followed', 'historical', 'That would make something come before itself.'),
}

/** The minimal shape of a stored link the helpers need. */
export interface LinkEdge {
  id: string
  fromArticleId: string
  toArticleId: string
  type: LinkType
}

/**
 * Storage direction for a new link. Symmetric types are stored with the
 * smaller id first, so either way round maps to one (from, to, type) key.
 */
export function canonicalLink(fromArticleId: string, toArticleId: string, type: LinkType): { fromArticleId: string; toArticleId: string } {
  if (LINK_TYPE_META[type].symmetric && toArticleId < fromArticleId) {
    return { fromArticleId: toArticleId, toArticleId: fromArticleId }
  }
  return { fromArticleId, toArticleId }
}

/** True when an equivalent link (same type, same ends; either order for symmetric types) exists. */
export function isDuplicateLink(edges: LinkEdge[], fromArticleId: string, toArticleId: string, type: LinkType): boolean {
  const c = canonicalLink(fromArticleId, toArticleId, type)
  return edges.some((e) => {
    if (e.type !== type) return false
    const k = canonicalLink(e.fromArticleId, e.toArticleId, e.type)
    return k.fromArticleId === c.fromArticleId && k.toArticleId === c.toArticleId
  })
}

/**
 * For an acyclic type, whether adding `from —type→ to` closes a loop: that is,
 * `to` already reaches `from` through links of the same type. Self-links are
 * a loop of one. Always false for types that may loop.
 */
export function wouldCreateLoop(edges: LinkEdge[], fromArticleId: string, toArticleId: string, type: LinkType): boolean {
  if (!LINK_TYPE_META[type].acyclic) return false
  if (fromArticleId === toArticleId) return true
  const next = new Map<string, string[]>()
  for (const e of edges) {
    if (e.type !== type) continue
    const list = next.get(e.fromArticleId) ?? []
    list.push(e.toArticleId)
    next.set(e.fromArticleId, list)
  }
  const seen = new Set<string>()
  const stack = [toArticleId]
  while (stack.length) {
    const node = stack.pop() as string
    if (node === fromArticleId) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const n of next.get(node) ?? []) stack.push(n)
  }
  return false
}

// ── Reading an article's connections ──────────────────────────────────────

export type ConnectionDirection = 'outgoing' | 'incoming' | 'mutual'

export interface Connection<A> {
  linkId: string
  type: LinkType
  direction: ConnectionDirection
  /** The relationship as read from the article being viewed. */
  label: string
  other: A
  note: string
}

export interface ConnectionGroup<A> {
  /** Stable key: `${type}:${direction}` ('mutual' for symmetric types). */
  key: string
  type: LinkType
  direction: ConnectionDirection
  label: string
  family: RelationshipFamily
  items: Connection<A>[]
}

/**
 * An article's connections, grouped by how they read from it ("Lives in",
 * "Home of", "Ally of"), in LINK_TYPES order, outgoing before incoming. Links
 * whose other end the reader cannot see are left out.
 */
export function groupConnections<A extends { id: string; title: string }>(
  articleId: string,
  edges: Array<LinkEdge & { note?: string }>,
  articlesById: Map<string, A>,
): ConnectionGroup<A>[] {
  const groups = new Map<string, ConnectionGroup<A>>()
  for (const e of edges) {
    let direction: ConnectionDirection
    let otherId: string
    if (e.fromArticleId === articleId) {
      direction = 'outgoing'
      otherId = e.toArticleId
    } else if (e.toArticleId === articleId) {
      direction = 'incoming'
      otherId = e.fromArticleId
    } else continue
    const other = articlesById.get(otherId)
    if (!other) continue
    const meta = LINK_TYPE_META[e.type]
    if (meta.symmetric) direction = 'mutual'
    const label = direction === 'incoming' ? meta.inverse : meta.forward
    const key = `${e.type}:${direction}`
    const group = groups.get(key) ?? { key, type: e.type, direction, label, family: meta.family, items: [] }
    group.items.push({ linkId: e.id, type: e.type, direction, label, other, note: e.note ?? '' })
    groups.set(key, group)
  }
  const order = (g: ConnectionGroup<A>) => LINK_TYPES.indexOf(g.type) * 3 + (g.direction === 'incoming' ? 1 : 0)
  const out = [...groups.values()].sort((a, b) => order(a) - order(b))
  for (const g of out) g.items.sort((a, b) => a.other.title.localeCompare(b.other.title))
  return out
}

// ── Creating links from either end ────────────────────────────────────────

export interface LinkOption {
  /** `${type}:${direction}`, for <select> values. */
  value: string
  type: LinkType
  /** 'outgoing': this article is the source. 'incoming': this article is the target. */
  direction: 'outgoing' | 'incoming'
  /** Reads "This article is <label> …". */
  label: string
}

/**
 * Every relationship an editor can add from one article: each type read
 * forward, and asymmetric types also read backward ("home of" creates
 * "<other> lives in <this>").
 */
export function linkOptions(): LinkOption[] {
  const out: LinkOption[] = []
  for (const type of LINK_TYPES) {
    const meta = LINK_TYPE_META[type]
    out.push({ value: `${type}:outgoing`, type, direction: 'outgoing', label: meta.forward })
    if (!meta.symmetric) out.push({ value: `${type}:incoming`, type, direction: 'incoming', label: meta.inverse })
  }
  return out
}

/** The stored (from, to) pair for an option chosen on `articleId` pointing at `otherId`. */
export function endsFor(option: Pick<LinkOption, 'direction'>, articleId: string, otherId: string) {
  return option.direction === 'outgoing'
    ? { fromArticleId: articleId, toArticleId: otherId }
    : { fromArticleId: otherId, toArticleId: articleId }
}
