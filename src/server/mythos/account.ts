/**
 * Per-account preferences (ADR-026). One `account_settings` row per user,
 * written only by `setAccountSettings`; no row means the defaults.
 */

import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS } from '../../domain/mythos'
import type { AccountSettingsData } from '../../domain/records'
import { queryAll, type Envelope } from './store'

export const ACCOUNT_DEFAULTS: Omit<AccountSettingsData, 'userId'> = { assistantEnabled: true }

/** The stored value is a boolean column (0/1 in storage); treat only an explicit off as off. */
export function isEnabled(value: unknown): boolean {
  return !(value === false || value === 0 || value === '0')
}

export async function accountRow(tools: ActionTools, userId: string): Promise<Envelope<AccountSettingsData> | null> {
  const [row] = await queryAll<AccountSettingsData>(tools, COLLECTIONS.accountSettings, { where: { userId } })
  return row ?? null
}

/** Whether `userId` has the AI assistant switched on (the default). */
export async function assistantEnabled(tools: ActionTools, userId: string): Promise<boolean> {
  const row = await accountRow(tools, userId)
  return row ? isEnabled(row.data.assistantEnabled) : ACCOUNT_DEFAULTS.assistantEnabled
}
