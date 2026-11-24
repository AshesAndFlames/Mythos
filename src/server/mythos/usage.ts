/**
 * Per-user daily caps on paid or abusable work (cover uploads, invitation
 * emails). Counts live in the `usage` collection, one row per user, UTC day
 * and kind, written only with the system tools.
 */

import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS, type UsageKind } from '../../domain/mythos'
import type { UsageData } from '../../domain/records'
import { queryAll } from './store'

/** `YYYY-MM-DD` in UTC: the window the daily caps count in. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Counts one use of `kind` for `userId` today. Returns false, without
 * counting, when the user has already reached `cap`.
 *
 * The count is read and then written, so two simultaneous calls can both
 * pass at the cap (see KNOWN_ISSUES K-10); the overshoot is at most the
 * number of concurrent requests.
 */
export async function consumeDailyQuota(
  system: ActionTools,
  userId: string,
  kind: UsageKind,
  cap: number,
  now = new Date(),
): Promise<boolean> {
  const where = { userId, day: utcDay(now), kind }
  for (let attempt = 0; attempt < 2; attempt++) {
    const [row] = await queryAll<UsageData>(system, COLLECTIONS.usage, { where })
    const count = row?.data.count ?? 0
    if (count >= cap) return false
    const res = row
      ? await system.update(COLLECTIONS.usage, row.recordId, { count: count + 1 })
      : await system.create(COLLECTIONS.usage, { ...where, count: 1 })
    if (res.success) return true
    // Two first uses of the day at once: the unique rule kept one row; count on it.
    if (!row && res.error?.startsWith('Duplicate:')) continue
    throw new Error(`Counting ${kind} usage failed: ${res.error ?? 'unknown error'}`)
  }
  throw new Error(`Counting ${kind} usage failed: the usage row kept changing`)
}
