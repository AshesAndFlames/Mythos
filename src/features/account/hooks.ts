/**
 * The signed-in user's account settings (ADR-026). Read live from their own
 * `account_settings` row (the RecordRoom sends no one else's); saved through
 * `setAccountSettings`. No row yet means the defaults.
 */

import { useAuth, useQuery } from 'deepspace'
import { COLLECTIONS } from '@/domain/mythos'
import type { AccountSettingsData } from '@/domain/records'
import type { LoadStatus } from '@/features/universes/hooks'

/** Stored booleans may arrive as 0/1; only an explicit off is off. */
const isOn = (value: unknown) => !(value === false || value === 0 || value === '0')

export function useAccountSettings(): { assistantEnabled: boolean; status: LoadStatus } {
  const { userId } = useAuth()
  const { records, status } = useQuery<AccountSettingsData>(COLLECTIONS.accountSettings, {
    where: { userId: userId ?? '' },
  })
  const row = records[0]
  return { assistantEnabled: row ? isOn(row.data.assistantEnabled) : true, status }
}
