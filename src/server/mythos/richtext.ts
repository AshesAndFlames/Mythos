/**
 * Validation and fingerprinting for rich-text JSON (ProseMirror/Tiptap form).
 *
 * Revisions store a snapshot the editor sends (ADR-017), so this is the
 * server boundary for that content: structure, type names, attribute values,
 * depth, node count and serialized size are all bounded. Node and mark names
 * are checked for shape, not membership in one editor schema, so the editor
 * can gain node types without a migration; the renderer must ignore unknown
 * ones. Attribute values are scalars only, and `href`-like attributes are
 * restricted to safe URL schemes.
 */

import { z } from 'zod'
import { LIMITS } from '../../domain/mythos'
import type { RichTextNode } from '../../domain/records'

const typeName = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Invalid node type')

const attrValue = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])

const URL_ATTRS = new Set(['href', 'src'])
const SAFE_URL = /^(https?:|mailto:|\/|#)/i

const attrs = z
  .record(z.string().min(1).max(50), attrValue)
  .refine((a) => Object.keys(a).length <= 20, 'Too many attributes')
  .refine(
    (a) =>
      Object.entries(a).every(
        ([k, v]) => !URL_ATTRS.has(k) || v === null || v === '' || (typeof v === 'string' && SAFE_URL.test(v.trim())),
      ),
    'Links must use http, https or mailto',
  )

const mark = z.object({ type: typeName, attrs: attrs.optional() }).strict()

const node: z.ZodType<RichTextNode> = z.lazy(() =>
  z
    .object({
      type: typeName,
      attrs: attrs.optional(),
      content: z.array(node).max(5000).optional(),
      marks: z.array(mark).max(20).optional(),
      text: z.string().max(LIMITS.richTextChars).optional(),
    })
    .strict(),
)

function measure(root: RichTextNode): { depth: number; nodes: number } {
  let nodes = 0
  let depth = 0
  const stack: Array<[RichTextNode, number]> = [[root, 1]]
  while (stack.length) {
    const [n, d] = stack.pop() as [RichTextNode, number]
    nodes++
    if (d > depth) depth = d
    for (const child of n.content ?? []) stack.push([child, d + 1])
  }
  return { depth, nodes }
}

/** A whole document: root node must be `doc`. Bounded in depth, count and size. */
export const richTextDocSchema = node.superRefine((doc, ctx) => {
  if (doc.type !== 'doc') {
    ctx.addIssue({ code: 'custom', message: 'Content must be a rich-text document' })
    return
  }
  const { depth, nodes } = measure(doc)
  if (depth > LIMITS.richTextDepth) ctx.addIssue({ code: 'custom', message: 'Content is nested too deeply' })
  if (nodes > LIMITS.richTextNodes) ctx.addIssue({ code: 'custom', message: 'Content is too long' })
  if (JSON.stringify(doc).length > LIMITS.richTextChars) {
    ctx.addIssue({ code: 'custom', message: 'Content is too long' })
  }
})

/** JSON with object keys sorted, so equal documents serialize identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** SHA-256 hex of a revision's meaningful content. */
export async function revisionFingerprint(title: string, summary: string, content: RichTextNode): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson({ title, summary, content }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Plain text of a document (for excerpts and search). */
export function richTextToPlain(doc: RichTextNode): string {
  const parts: string[] = []
  const walk = (n: RichTextNode) => {
    if (typeof n.text === 'string') parts.push(n.text)
    for (const c of n.content ?? []) walk(c)
    if (n.type === 'paragraph' || n.type === 'heading') parts.push('\n')
  }
  walk(doc)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}
