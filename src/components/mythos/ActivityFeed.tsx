/**
 * The activity feed: who did what, and when. Entries come from the
 * `activity` collection (members only, written by server actions).
 */

import { Link } from 'react-router-dom'
import { describeActivity } from '@/domain/activity'
import type { ActivityView } from '@/features/universes/hooks'
import { relativeTime } from '@/lib/format'

function fullTime(iso: string) {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function ActivityFeed({
  entries,
  names,
  articleIds,
  universeNames,
}: {
  entries: ActivityView[]
  /** userId → display name. */
  names: Map<string, string>
  /** Articles that still exist (deleted ones show their title without a link). */
  articleIds: Set<string>
  /** universeId → name; shown under each entry when given (cross-universe feeds). */
  universeNames?: Map<string, string>
}) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-4" data-testid="activity-feed">
      {entries.map((entry) => {
        const text = describeActivity(entry)
        const universeName = universeNames?.get(entry.universeId)
        return (
          <li key={entry.id} className="text-sm" data-testid="activity-entry" data-kind={entry.kind}>
            <span className="absolute -left-[3px] mt-1.5 size-1.5 rounded-full bg-primary/70" aria-hidden />
            <p className="text-foreground">
              <span className="font-medium" data-testid="activity-actor">
                {names.get(entry.actorId) ?? 'Someone'}
              </span>{' '}
              {text.verb}{' '}
              {text.subject &&
                (text.isArticle && articleIds.has(entry.subjectId) ? (
                  <Link
                    to={`/u/${entry.universeId}/a/${entry.subjectId}`}
                    className="font-display text-base font-semibold text-primary hover:underline"
                  >
                    {text.subject}
                  </Link>
                ) : (
                  <span className={text.isArticle ? 'font-display text-base font-semibold' : 'font-medium'}>{text.subject}</span>
                ))}
              {text.suffix && ` ${text.suffix}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {universeName && `${universeName} · `}
              <time dateTime={entry.at} title={fullTime(entry.at)}>
                {relativeTime(entry.at)}
              </time>
            </p>
          </li>
        )
      })}
    </ol>
  )
}
