/**
 * The activity feed's rules, shared by the server (what to record) and the
 * UI (how an entry reads). Runtime-neutral: no browser or worker imports.
 */

import type { ActivityData } from './records'

/** Saves of one article by one person within this window fold into one entry. */
export const UPDATE_COALESCE_MS = 15 * 60 * 1000

/**
 * Whether a new "updated" entry should fold into the previous one by the
 * same person for the same article, instead of adding a row.
 */
export function shouldCoalesce(previousAt: string, now: Date): boolean {
  const prev = Date.parse(previousAt)
  if (Number.isNaN(prev)) return false
  const gap = now.getTime() - prev
  return gap >= 0 && gap < UPDATE_COALESCE_MS
}

/**
 * An email as the feed shows it to every member: enough to recognise, not
 * enough to harvest. "friend@example.com" → "f•••@example.com".
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email.charAt(0)}•••${email.slice(at)}`
}

export interface ActivityText {
  /** Words after the actor's name, before the subject. */
  verb: string
  /** The subject as shown (an article title or a masked email); '' when none. */
  subject: string
  /** Whether the subject is an article that can be linked to. */
  isArticle: boolean
  /** Words after the subject. */
  suffix: string
}

/** How one entry reads after the actor's name: "published *Aria*", "joined as editor". */
export function describeActivity(entry: Pick<ActivityData, 'kind' | 'subjectTitle' | 'detail'>): ActivityText {
  switch (entry.kind) {
    case 'article_created':
      return { verb: 'created', subject: entry.subjectTitle, isArticle: true, suffix: '' }
    case 'article_updated':
      return { verb: 'updated', subject: entry.subjectTitle, isArticle: true, suffix: '' }
    case 'article_published':
      return { verb: 'published', subject: entry.subjectTitle, isArticle: true, suffix: '' }
    case 'member_invited':
      return { verb: 'invited', subject: entry.subjectTitle, isArticle: false, suffix: entry.detail ? `as ${entry.detail}` : '' }
    case 'member_joined':
      return { verb: 'joined', subject: '', isArticle: false, suffix: entry.detail ? `as ${entry.detail}` : '' }
  }
}
