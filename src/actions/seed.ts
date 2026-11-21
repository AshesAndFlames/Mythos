/**
 * Local-development seed: creates an example universe for the caller,
 * built entirely through the real actions (so every row passes the same
 * validation and role checks as user input). The caller becomes its owner.
 *
 * Refused outside local dev: production has the PLATFORM_WORKER service
 * binding, which `deepspace dev` / `test run` do not.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import { z } from 'zod'
import type { Env } from '../../worker'
import type { ArticleType, LinkType } from '../domain/mythos'
import type { RichTextNode } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { createArticle, setArticleCategory } from './articles'
import { createCategory } from './categories'
import { createLink } from './links'
import { saveRevision } from './revisions'
import { setArticleTags } from './tags'
import { createUniverse } from './universes'

export function isLocalDev(env: Env): boolean {
  return !env.PLATFORM_WORKER
}

interface SeedArticle {
  key: string
  title: string
  type: ArticleType
  summary: string
  category: string
  tags: string[]
  body: string[]
}

export const SEED = {
  universe: {
    name: 'The Shattered Realms',
    tagline: 'Seven kingdoms under one broken sky.',
    description: 'An example universe for local development.',
  },
  categories: ['People', 'Places', 'Factions', 'History'],
  articles: [
    {
      key: 'aria',
      title: 'Aria Vell',
      type: 'character',
      summary: 'Knight-captain of the Silver Dawn and survivor of the Sundering.',
      category: 'People',
      tags: ['knight', 'silver dawn'],
      body: ['Aria Vell was born in the Northern Marches.', 'She took her oath in Silverhold at sixteen.'],
    },
    {
      key: 'silverhold',
      title: 'Silverhold',
      type: 'location',
      summary: 'A fortress-city carved into the northern cliffs.',
      category: 'Places',
      tags: ['capital'],
      body: ['Silverhold guards the only pass through the Marches.'],
    },
    {
      key: 'marches',
      title: 'Northern Marches',
      type: 'location',
      summary: 'Wind-scoured highlands at the edge of the realms.',
      category: 'Places',
      tags: [],
      body: ['Little grows in the Marches but stubbornness.'],
    },
    {
      key: 'order',
      title: 'Order of the Silver Dawn',
      type: 'faction',
      summary: 'A knightly order sworn to hold the pass.',
      category: 'Factions',
      tags: ['knight', 'silver dawn'],
      body: ['The Order was founded in the year the sky broke.'],
    },
    {
      key: 'sundering',
      title: 'The Sundering',
      type: 'event',
      summary: 'The night the sky cracked and the seven kingdoms fell apart.',
      category: 'History',
      tags: ['war'],
      body: ['No two chronicles agree on what caused the Sundering.'],
    },
  ] satisfies SeedArticle[],
  links: [
    ['aria', 'lives_in', 'silverhold'],
    ['aria', 'member_of', 'order'],
    ['aria', 'participated_in', 'sundering'],
    ['order', 'located_in', 'silverhold'],
    ['silverhold', 'located_in', 'marches'],
    ['aria', 'created', 'order'],
  ] satisfies Array<[string, LinkType, string]>,
}

export function seedBody(paragraphs: string[]): RichTextNode {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  }
}

/** Runs another Mythos action as the same caller and unwraps its data. */
async function run<T>(
  handler: ActionHandler<Env>,
  ctx: { userId: string; tools: ActionTools; env: Env },
  params: Record<string, unknown>,
): Promise<T> {
  const res = await handler({ ...ctx, params, callerJwt: '' })
  if (!res.success) throw new Error(`Seed step failed: ${res.error}`)
  return res.data as T
}

export const seedExampleUniverse = mythosAction(
  'seedExampleUniverse',
  z.object({}).strict(),
  async ({ userId, tools, env }) => {
    if (!isLocalDev(env)) throw new UserError('Seeding is only available in local development.')
    const ctx = { userId, tools, env }

    const { universeId } = await run<{ universeId: string }>(createUniverse, ctx, SEED.universe)

    const categoryIds = new Map<string, string>()
    for (const name of SEED.categories) {
      const { categoryId } = await run<{ categoryId: string }>(createCategory, ctx, { universeId, name })
      categoryIds.set(name, categoryId)
    }

    const articleIds = new Map<string, string>()
    for (const a of SEED.articles) {
      const { articleId } = await run<{ articleId: string }>(createArticle, ctx, {
        universeId,
        title: a.title,
        type: a.type,
        summary: a.summary,
      })
      articleIds.set(a.key, articleId)
      await run(setArticleCategory, ctx, { articleId, categoryId: categoryIds.get(a.category) })
      if (a.tags.length) await run(setArticleTags, ctx, { articleId, tags: a.tags })
      await run(saveRevision, ctx, { articleId, content: seedBody(a.body), note: 'Seed' })
    }

    for (const [from, type, to] of SEED.links) {
      await run(createLink, ctx, { fromArticleId: articleIds.get(from), toArticleId: articleIds.get(to), type })
    }

    return {
      universeId,
      articleIds: Object.fromEntries(articleIds),
      categoryIds: Object.fromEntries(categoryIds),
    }
  },
)
