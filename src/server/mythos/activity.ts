/**
 * Writes the activity feed. Entries are created under the system identity
 * (like every universe-owned row), so `read: 'team'` alone decides who sees
 * them.
 *
 * The feed is secondary to the action that triggers it: when an entry cannot
 * be written, the action's own change has already succeeded, so the failure
 * is logged with its context rather than reported as a failed save.
 */

import type { ActionTools } from 'deepspace/worker'
import { shouldCoalesce } from '../../domain/activity'
import { COLLECTIONS } from '../../domain/mythos'
import type { ActivityData } from '../../domain/records'
import { mustSucceed, queryAll } from './store'

export type ActivityEntry = Omit<ActivityData, 'at' | 'subjectId' | 'subjectTitle' | 'detail'> &
  Partial<Pick<ActivityData, 'subjectId' | 'subjectTitle' | 'detail'>>

async function write(tools: ActionTools, system: ActionTools, entry: ActivityEntry, now: Date) {
  const at = now.toISOString()
  const row: ActivityData = {
    subjectId: '',
    subjectTitle: '',
    detail: '',
    ...entry,
    at,
  }
  if (entry.kind === 'article_updated' && row.subjectId) {
    const previous = await queryAll<ActivityData>(tools, COLLECTIONS.activity, {
      where: { universeId: row.universeId, subjectId: row.subjectId, actorId: row.actorId, kind: 'article_updated' },
      orderBy: 'at',
      orderDir: 'desc',
    })
    const latest = previous[0]
    if (latest && shouldCoalesce(latest.data.at, now)) {
      await mustSucceed(
        system.update(COLLECTIONS.activity, latest.recordId, { at, subjectTitle: row.subjectTitle }),
        'Updating the activity entry',
      )
      return
    }
  }
  await mustSucceed(system.create(COLLECTIONS.activity, { ...row }), 'Recording activity')
}

/** Records one activity entry; logs (never throws) when that fails. */
export async function recordActivity(
  tools: ActionTools,
  system: ActionTools,
  entry: ActivityEntry,
  now = new Date(),
): Promise<void> {
  try {
    await write(tools, system, entry, now)
  } catch (err) {
    console.error(
      `[activity] ${entry.kind} in universe ${entry.universeId} by ${entry.actorId} was not recorded: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}
