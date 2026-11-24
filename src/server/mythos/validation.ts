/**
 * Zod schemas for every Mythos server action's params.
 *
 * Actions parse `params` with these before touching any record. Client forms
 * may reuse them for inline errors, but the server parse is the boundary.
 */

import { z } from 'zod'
import {
  ARTICLE_STATUSES,
  ARTICLE_TYPES,
  COVER_KEY_PATTERN,
  ASSIGNABLE_ROLES,
  LIMITS,
  LINK_TYPES,
  MEDIA_KEY_PATTERN,
  MEDIA_KINDS,
  UNIVERSE_VISIBILITIES,
} from '../../domain/mythos'
import { richTextDocSchema } from './richtext'

/** '' (no cover) or a key Mythos generated: `covers/<uuid>.<ext>`. */
export const coverKeySchema = z.union([
  z.literal(''),
  z.string().regex(COVER_KEY_PATTERN, 'Invalid cover image'),
])

/** Record ids: UUIDs or SDK-generated ids. Never free text. */
export const recordIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid id')

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)

const requiredText = (max: number, label: string) =>
  trimmed(max, label).min(1, `${label} is required`)

export const createUniverseSchema = z.object({
  name: requiredText(LIMITS.universeName, 'Name'),
  tagline: trimmed(LIMITS.universeTagline, 'Tagline').optional().default(''),
  description: trimmed(LIMITS.universeDescription, 'Description').optional().default(''),
  artStyle: trimmed(LIMITS.artStyle, 'Art style').optional().default(''),
})
export type CreateUniverseInput = z.input<typeof createUniverseSchema>

export const updateUniverseSchema = z.object({
  universeId: recordIdSchema,
  name: requiredText(LIMITS.universeName, 'Name').optional(),
  tagline: trimmed(LIMITS.universeTagline, 'Tagline').optional(),
  description: trimmed(LIMITS.universeDescription, 'Description').optional(),
  artStyle: trimmed(LIMITS.artStyle, 'Art style').optional(),
})

export const universeIdSchema = z.object({ universeId: recordIdSchema })

export const inviteMemberSchema = z.object({
  universeId: recordIdSchema,
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(LIMITS.email),
  role: z.enum(ASSIGNABLE_ROLES),
})
export type InviteMemberInput = z.input<typeof inviteMemberSchema>

export const invitationIdSchema = z.object({ invitationId: recordIdSchema })

export const respondToInvitationSchema = z.object({
  invitationId: recordIdSchema,
  accept: z.boolean(),
})

/** Actions that take no input still validate that they got none. */
export const noParamsSchema = z.object({}).strict()

export const setMemberRoleSchema = z.object({
  universeId: recordIdSchema,
  userId: recordIdSchema,
  role: z.enum(ASSIGNABLE_ROLES),
})

export const removeMemberSchema = z.object({
  universeId: recordIdSchema,
  userId: recordIdSchema,
})

export const createArticleSchema = z.object({
  universeId: recordIdSchema,
  title: requiredText(LIMITS.articleTitle, 'Title'),
  type: z.enum(ARTICLE_TYPES),
  summary: trimmed(LIMITS.articleSummary, 'Summary').optional().default(''),
})
export type CreateArticleInput = z.input<typeof createArticleSchema>

export const renameArticleSchema = z.object({
  articleId: recordIdSchema,
  title: requiredText(LIMITS.articleTitle, 'Title'),
})

export const articleIdSchema = z.object({ articleId: recordIdSchema })

export const setArticleInfoboxSchema = z.object({
  articleId: recordIdSchema,
  infobox: z
    .array(
      z.object({
        key: requiredText(LIMITS.infoboxKey, 'Infobox label'),
        value: trimmed(LIMITS.infoboxValue, 'Infobox value'),
      }),
    )
    .max(LIMITS.infoboxEntries, `At most ${LIMITS.infoboxEntries} infobox rows`),
})

// ── Universe settings ─────────────────────────────────────────────────────

export const updateUniverseSettingsSchema = updateUniverseSchema
  .extend({ visibility: z.enum(UNIVERSE_VISIBILITIES).optional(), coverImageKey: coverKeySchema.optional() })
  .refine(
    (v) => Object.keys(v).some((k) => k !== 'universeId'),
    'Nothing to update',
  )

/** Typing the universe's name is the confirmation for deleting it. */
export const deleteUniverseSchema = z.object({
  universeId: recordIdSchema,
  confirmName: z.string().max(LIMITS.universeName),
})

// ── Categories ────────────────────────────────────────────────────────────

/** '' means "no category" / "top level". */
const optionalId = z.union([z.literal(''), recordIdSchema])

export const createCategorySchema = z.object({
  universeId: recordIdSchema,
  name: requiredText(LIMITS.categoryName, 'Category name'),
  parentId: optionalId.optional().default(''),
})

export const updateCategorySchema = z.object({
  categoryId: recordIdSchema,
  name: requiredText(LIMITS.categoryName, 'Category name').optional(),
  parentId: optionalId.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
})

export const categoryIdSchema = z.object({ categoryId: recordIdSchema })

export const setArticleCategorySchema = z.object({
  articleId: recordIdSchema,
  categoryId: optionalId,
})

// ── Tags ──────────────────────────────────────────────────────────────────

const tagName = requiredText(LIMITS.tag, 'Tag')

export const setArticleTagsSchema = z.object({
  articleId: recordIdSchema,
  tags: z.array(tagName).max(LIMITS.tags, `At most ${LIMITS.tags} tags per article`),
})

export const tagIdSchema = z.object({ tagId: recordIdSchema })

// ── Relationships ─────────────────────────────────────────────────────────

export const createLinkSchema = z
  .object({
    fromArticleId: recordIdSchema,
    toArticleId: recordIdSchema,
    type: z.enum(LINK_TYPES),
    note: trimmed(LIMITS.linkNote, 'Note').optional().default(''),
  })
  .refine((v) => v.fromArticleId !== v.toArticleId, 'An article cannot be linked to itself')

export const linkIdSchema = z.object({ linkId: recordIdSchema })

// ── Revisions ─────────────────────────────────────────────────────────────

export const saveRevisionSchema = z.object({
  articleId: recordIdSchema,
  content: richTextDocSchema,
  note: trimmed(LIMITS.revisionNote, 'Note').optional().default(''),
})

export const revisionIdSchema = z.object({ revisionId: recordIdSchema })

// ── Whole-article save (editor "Save draft" / "Publish") ──────────────────

export const saveArticleSchema = z.object({
  articleId: recordIdSchema,
  title: requiredText(LIMITS.articleTitle, 'Title'),
  type: z.enum(ARTICLE_TYPES),
  summary: trimmed(LIMITS.articleSummary, 'Summary'),
  status: z.enum(ARTICLE_STATUSES),
  categoryId: optionalId,
  tags: z.array(tagName).max(LIMITS.tags, `At most ${LIMITS.tags} tags per article`),
  coverImageKey: coverKeySchema,
  /** The editor's body snapshot; becomes a saved version when it differs. */
  content: richTextDocSchema,
  note: trimmed(LIMITS.revisionNote, 'Note').optional().default(''),
})
export type SaveArticleInput = z.input<typeof saveArticleSchema>

/** Formats the first Zod issue as a user-facing sentence. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid input'
  const field = issue.path.join('.')
  return field && !issue.message.toLowerCase().startsWith(field.toLowerCase())
    ? `${field}: ${issue.message}`
    : issue.message
}

/** Explore's search box: optional, trimmed, bounded. */
export const listPublicUniversesSchema = z.object({
  query: z.string().trim().max(LIMITS.universeName).optional(),
})

export const publicArticleSchema = z.object({
  universeId: recordIdSchema,
  articleId: recordIdSchema,
})

// ── Maps and images (ADR-025) ─────────────────────────────────────────────

const mediaKeySchema = z.string().regex(MEDIA_KEY_PATTERN, 'Invalid image key')

export const addMediaSchema = z.object({
  universeId: recordIdSchema,
  key: mediaKeySchema,
  title: requiredText(LIMITS.mediaTitle, 'Title'),
  caption: trimmed(LIMITS.mediaCaption, 'Caption').optional().default(''),
  kind: z.enum(MEDIA_KINDS),
})

export const updateMediaSchema = z
  .object({
    mediaId: recordIdSchema,
    title: requiredText(LIMITS.mediaTitle, 'Title').optional(),
    caption: trimmed(LIMITS.mediaCaption, 'Caption').optional(),
    kind: z.enum(MEDIA_KINDS).optional(),
  })
  .refine((v) => v.title !== undefined || v.caption !== undefined || v.kind !== undefined, 'Nothing to update')

export const mediaIdSchema = z.object({ mediaId: recordIdSchema })

/** The article's gallery images, in display order (replaces the current set). */
export const setArticleMediaSchema = z.object({
  articleId: recordIdSchema,
  mediaIds: z
    .array(recordIdSchema)
    .max(LIMITS.mediaPerArticle, `At most ${LIMITS.mediaPerArticle} images per article`)
    .refine((ids) => new Set(ids).size === ids.length, 'An image can be shown only once per article'),
})

export const accountSettingsSchema = z.object({ assistantEnabled: z.boolean() })
