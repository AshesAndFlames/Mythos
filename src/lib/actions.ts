/**
 * Calls a server action at POST /api/actions/:name with the caller's JWT.
 * Always resolves (never throws) with a discriminated result, so callers
 * render the error rather than losing it in an unhandled rejection.
 */

import { getAuthToken } from 'deepspace'

export type ActionOutcome<T> = { ok: true; data: T } | { ok: false; error: string }

export async function callAction<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<ActionOutcome<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { ok: false, error: 'Your session has expired. Please sign in again.' }
    const res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: T; error?: string }
      | null
    if (body?.success === true) return { ok: true, data: body.data as T }
    return {
      ok: false,
      error: body?.error ?? `The server answered ${res.status}. Please try again.`,
    }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}
