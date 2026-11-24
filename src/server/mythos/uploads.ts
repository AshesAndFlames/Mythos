/**
 * Server-side policy for the `/api/files/*` proxy (see SECURITY_REVIEW.md, S-1).
 *
 * The platform file gateway scopes files to this app and refuses HTML, SVG
 * and JS, but any signed-in user could otherwise list, overwrite and delete
 * every app-scope file and upload any type or size. Mythos only ever uploads
 * cover images and gallery maps/images (ADR-025), so the worker narrows the
 * gateway to exactly that:
 *
 * - reads of one file pass (covers render in plain <img> tags);
 * - listing, deleting, multipart and every other write are refused;
 * - an upload must target a fresh `covers/<universeId>/<uuid>.<ext>` or
 *   `media/<universeId>/<uuid>.<ext>` key, be at most COVER_MAX_BYTES or
 *   MEDIA_MAX_BYTES respectively, carry real PNG/JPEG/WebP/GIF bytes matching
 *   the key's extension, come from an owner or editor of that universe, and
 *   stay within a per-user daily cap for its kind.
 */

import type { ActionTools } from 'deepspace/worker'
import {
  COVER_KEY_PATTERN,
  COVER_MAX_BYTES,
  coverKeyUniverse,
  MEDIA_MAX_BYTES,
  mediaKeyUniverse,
  type CoverMime,
} from '../../domain/mythos'
import { getMembership, getUniverse } from './store'
import { consumeDailyQuota } from './usage'

export { utcDay } from './usage'

export const FILES_BASE = '/api/files'
/** Room for the multipart envelope around a cover-sized file. */
export const UPLOAD_ENVELOPE_BYTES = 64 * 1024
/** Cover uploads one user may make per UTC day. */
export const COVER_UPLOADS_PER_DAY = 40
/** Gallery uploads one user may make per UTC day. */
export const MEDIA_UPLOADS_PER_DAY = 30

/** What an upload is for: decides its size limit and daily cap. */
export type UploadPurpose = 'cover' | 'media'

export const UPLOAD_RULES: Record<UploadPurpose, { maxBytes: number; perDay: number; noun: string }> = {
  cover: { maxBytes: COVER_MAX_BYTES, perDay: COVER_UPLOADS_PER_DAY, noun: 'cover images' },
  media: { maxBytes: MEDIA_MAX_BYTES, perDay: MEDIA_UPLOADS_PER_DAY, noun: 'maps and images' },
}

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`

/** The refusal for a file over its purpose's limit. */
export function tooLargeMessage(purpose: UploadPurpose): string {
  const noun = purpose === 'cover' ? 'Cover images' : 'Maps and images'
  return `${noun} must be ${megabytes(UPLOAD_RULES[purpose].maxBytes)} or smaller.`
}

/** The purpose and universe a key names, or null when it is not an uploadable key. */
export function uploadTarget(key: string): { purpose: UploadPurpose; universeId: string } | null {
  const media = mediaKeyUniverse(key)
  if (media) return { purpose: 'media', universeId: media }
  // New covers must name their universe: `covers/<universeId>/<uuid>.<ext>`.
  const cover = COVER_KEY_PATTERN.test(key) ? coverKeyUniverse(key) : null
  return cover ? { purpose: 'cover', universeId: cover } : null
}

export type FilesDecision =
  | { kind: 'read' }
  | { kind: 'upload'; key: string; universeId: string; purpose: UploadPurpose }
  | { kind: 'refuse'; status: 400 | 403 | 411 | 413; error: string }

/** Decides what a `/api/files/*` request may do, before reading its body. */
export function classifyFilesRequest(method: string, url: URL, contentLength: string | null): FilesDecision {
  const path = url.pathname.replace(/\/+$/, '')
  if (method === 'GET' || method === 'HEAD') {
    if (path === FILES_BASE) return { kind: 'refuse', status: 403, error: 'Listing files is not allowed.' }
    return { kind: 'read' }
  }
  if (method !== 'POST' || path !== `${FILES_BASE}/upload`) {
    return { kind: 'refuse', status: 403, error: 'Files cannot be changed this way.' }
  }
  if (url.searchParams.get('scope') !== 'app') {
    return { kind: 'refuse', status: 403, error: 'Only cover images, maps and images can be uploaded.' }
  }
  const key = url.searchParams.get('key') ?? ''
  const target = uploadTarget(key)
  if (!target) return { kind: 'refuse', status: 400, error: 'Invalid image key.' }
  if (contentLength === null) return { kind: 'refuse', status: 411, error: 'The upload did not declare its length.' }
  const bytes = Number(contentLength)
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > UPLOAD_RULES[target.purpose].maxBytes + UPLOAD_ENVELOPE_BYTES) {
    return { kind: 'refuse', status: 413, error: tooLargeMessage(target.purpose) }
  }
  return { kind: 'upload', key, ...target }
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

/** The image type the bytes really are (by signature), or null. */
export function sniffImage(head: Uint8Array): CoverMime | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(head, ascii('GIF87a')) || startsWith(head, ascii('GIF89a'))) return 'image/gif'
  if (startsWith(head, ascii('RIFF')) && startsWith(head, ascii('WEBP'), 8)) return 'image/webp'
  return null
}

const EXTENSIONS: Record<CoverMime, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
}

/** Whether a cover key's extension names the type its bytes really are. */
export function extensionMatches(key: string, mime: CoverMime): boolean {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return EXTENSIONS[mime].includes(ext)
}

export class UploadRefused extends Error {
  constructor(
    readonly status: 403 | 409 | 429,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Refuses unless `userId` actively owns or edits `universeId`: covers are set
 * by owners on the universe and by editors on its articles, and editors add
 * to the gallery.
 */
export async function authorizeCoverUpload(system: ActionTools, userId: string, universeId: string): Promise<void> {
  const [universe, membership] = await Promise.all([
    getUniverse(system, universeId),
    getMembership(system, universeId, userId),
  ])
  const role = membership?.data.Status === 'active' ? membership.data.role : null
  if (!universe || (role !== 'owner' && role !== 'editor')) {
    throw new UploadRefused(403, 'Only owners and editors of this universe can upload its images.')
  }
}

/** Counts one upload against the caller's daily cap for its purpose, refusing past it. */
export async function countUpload(
  system: ActionTools,
  userId: string,
  purpose: UploadPurpose,
  now = new Date(),
): Promise<void> {
  const rules = UPLOAD_RULES[purpose]
  const kind = purpose === 'cover' ? 'upload' : 'media_upload'
  if (!(await consumeDailyQuota(system, userId, kind, rules.perDay, now))) {
    throw new UploadRefused(429, `You can upload at most ${rules.perDay} ${rules.noun} a day.`)
  }
}
