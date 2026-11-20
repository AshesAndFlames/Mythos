/**
 * Zod schemas for every Mythos server action's params.
 *
 * Actions parse `params` with these before touching any record. Client forms
 * may reuse them for inline errors, but the server parse is the boundary.
 */

import { z } from 'zod'
import { ARTICLE_TYPES, ASSIGNABLE_ROLES, LIMITS } from '../../domain/mythos'

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
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(320),
  role: z.enum(ASSIGNABLE_ROLES),
})
export type InviteMemberInput = z.input<typeof inviteMemberSchema>

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

/** Formats the first Zod issue as a user-facing sentence. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid input'
  const field = issue.path.join('.')
  return field && !issue.message.toLowerCase().startsWith(field.toLowerCase())
    ? `${field}: ${issue.message}`
    : issue.message
}
