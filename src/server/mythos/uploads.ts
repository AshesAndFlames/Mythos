/**
 * Server-side policy for the `/api/files/*` proxy (see SECURITY_REVIEW.md, S-1).
 *
 * The platform file gateway scopes files to this app and refuses HTML, SVG
 * and JS, but any signed-in user could otherwise list, overwrite and delete
 * every app-scope file and upload any type or size. Mythos only ever uploads
 * cover images, so the worker narrows the gateway to exactly that:
 *
 * - reads of one file pass (covers render in plain <img> tags);
 * - listing, deleting, multipart and every other write are refused;
 * - an upload must target a fresh `covers/<universeId>/<uuid>.<ext>` key, be
 *   at most COVER_MAX_BYTES, carry real PNG/JPEG/WebP/GIF bytes matching the
 *   key's extension, come from an owner or editor of that universe, and stay
 *   within a per-user daily cap.
 */

import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS, COVER_KEY_PATTERN, COVER_MAX_BYTES, coverKeyUniverse, type CoverMime } from '../../domain/mythos'
import { getMembership, getUniverse } from './store'
import { consumeDailyQuota } from './usage'

export { utcDay } from './usage'

export const FILES_BASE = '/api/files'
/** Room for the multipart envelope around a cover-sized file. */
export const UPLOAD_ENVELOPE_BYTES = 64 * 1024
/** Cover uploads one user may make per UTC day. */
export const COVER_UPLOADS_PER_DAY = 40

export type FilesDecision =
  | { kind: 'read' }
  | { kind: 'upload'; key: string; universeId: string }
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
    return { kind: 'refuse', status: 403, error: 'Only cover images can be uploaded.' }
  }
  const key = url.searchParams.get('key') ?? ''
  // New uploads must name their universe: `covers/<universeId>/<uuid>.<ext>`.
  const universeId = coverKeyUniverse(key)
  if (!COVER_KEY_PATTERN.test(key) || !universeId) {
    return { kind: 'refuse', status: 400, error: 'Invalid cover image key.' }
  }
  if (contentLength === null) return { kind: 'refuse', status: 411, error: 'The upload did not declare its length.' }
  const bytes = Number(contentLength)
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > COVER_MAX_BYTES + UPLOAD_ENVELOPE_BYTES) {
    return { kind: 'refuse', status: 413, error: 'Cover images must be 5 MB or smaller.' }
  }
  return { kind: 'upload', key, universeId }
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
 * by owners on the universe and by editors on its articles.
 */
export async function authorizeCoverUpload(system: ActionTools, userId: string, universeId: string): Promise<void> {
  const [universe, membership] = await Promise.all([
    getUniverse(system, universeId),
    getMembership(system, universeId, userId),
  ])
  const role = membership?.data.Status === 'active' ? membership.data.role : null
  if (!universe || (role !== 'owner' && role !== 'editor')) {
    throw new UploadRefused(403, 'Only owners and editors of this universe can upload its cover images.')
  }
}

/** Counts one upload against the caller's daily cap, refusing past it. */
export async function countCoverUpload(system: ActionTools, userId: string, now = new Date()): Promise<void> {
  if (!(await consumeDailyQuota(system, userId, 'upload', COVER_UPLOADS_PER_DAY, now))) {
    throw new UploadRefused(429, `You can upload at most ${COVER_UPLOADS_PER_DAY} cover images a day.`)
  }
}
