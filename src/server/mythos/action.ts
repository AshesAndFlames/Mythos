/**
 * `mythosAction` wraps a Mythos server action with the steps every action
 * shares: Zod-parse the params, provide the system-identity tools, and turn
 * known failures into `{ success: false, error }` results. Unexpected errors
 * are logged with the action name and caller, then reported generically —
 * never swallowed, never leaking internals to the client.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { z } from 'zod'
import { createActionTools } from '../action-tools.js'
import type { Env } from '../../../worker.js'
import { AccessDenied } from './membership'
import { firstIssue } from './validation'

export class UserError extends Error {}

export interface MythosActionContext<P> {
  /** Verified caller (JWT subject). */
  userId: string
  params: P
  /** RBAC-off tools acting as the caller (use for reads and integrations). */
  tools: ActionTools
  /**
   * RBAC-off tools acting as the app's system identity. Use these to CREATE
   * universe-owned rows, so a row's creator is never a member who could later
   * be removed (the DO's 'team' read also admits a row's creator).
   */
  system: ActionTools
  env: Env
}

export function mythosAction<S extends z.ZodType, R>(
  name: string,
  schema: S,
  run: (ctx: MythosActionContext<z.output<S>>) => Promise<R>,
): ActionHandler<Env> {
  return async ({ userId, params, tools, env }): Promise<ActionResult<R>> => {
    const parsed = schema.safeParse(params)
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
    try {
      const system = createActionTools(env, env.OWNER_USER_ID, '')
      const data = await run({ userId, params: parsed.data, tools, system, env })
      return { success: true, data }
    } catch (err) {
      if (err instanceof AccessDenied || err instanceof UserError) {
        return { success: false, error: err.message }
      }
      console.error(
        `[action ${name}] caller=${userId} failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
      )
      return { success: false, error: 'Something went wrong on the server. Please try again.' }
    }
  }
}
