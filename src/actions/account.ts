/** Account settings (ADR-026): the caller's own preferences only. */

import { COLLECTIONS } from '../domain/mythos'
import type { AccountSettingsData } from '../domain/records'
import { mythosAction } from '../server/mythos/action'
import { accountRow } from '../server/mythos/account'
import { mustSucceed } from '../server/mythos/store'
import { accountSettingsSchema } from '../server/mythos/validation'

/** Saves the caller's settings. There is no user id parameter: it is always the caller's own row. */
export const setAccountSettings = mythosAction(
  'setAccountSettings',
  accountSettingsSchema,
  async ({ userId, params, tools, system }) => {
    const row = await accountRow(tools, userId)
    if (row) {
      await mustSucceed(system.update(COLLECTIONS.accountSettings, row.recordId, { ...params }), 'Saving your settings')
    } else {
      const data: AccountSettingsData = { userId, ...params }
      const created = await system.create(COLLECTIONS.accountSettings, { ...data })
      if (!created.success) {
        // Saved twice at once: the unique rule kept one row; update it.
        const raced = await accountRow(tools, userId)
        if (!raced) throw new Error(`Saving settings failed: ${created.error ?? 'unknown error'}`)
        await mustSucceed(system.update(COLLECTIONS.accountSettings, raced.recordId, { ...params }), 'Saving your settings')
      }
    }
    return { ...params }
  },
)
