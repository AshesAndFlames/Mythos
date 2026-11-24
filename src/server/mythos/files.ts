/**
 * Server-side deletion of gallery files (ADR-025). The `/api/files` proxy
 * refuses every client DELETE, so files are removed only here, after an
 * action has checked the caller's role and removed the row that named them.
 */

import { platformWorkerFetch } from 'deepspace/worker'
import { MEDIA_KEY_PATTERN } from '../../domain/mythos'
import type { Env } from '../../../worker'

function platformHeaders(env: Env): Headers {
  const headers = new Headers()
  headers.set('x-user-id', env.OWNER_USER_ID)
  if (env.APP_IDENTITY_TOKEN) {
    headers.set('x-app-identity-token', env.APP_IDENTITY_TOKEN)
    headers.set('x-app-id', env.DEEPSPACE_APP_ID)
  }
  return headers
}

function filePath(env: Env, key: string): string {
  return `/internal/files/apps/${env.DEEPSPACE_APP_ID}/${key.split('/').map(encodeURIComponent).join('/')}?scope=app`
}

/** Whether a gallery file was really uploaded. Throws when the store cannot answer. */
export async function mediaFileExists(env: Env, key: string): Promise<boolean> {
  if (!MEDIA_KEY_PATTERN.test(key)) return false
  const res = await platformWorkerFetch(env, filePath(env, key), { method: 'HEAD', headers: platformHeaders(env) })
  if (res.status === 200) return true
  if (res.status === 404) return false
  throw new Error(`Checking ${key} answered ${res.status}`)
}

/**
 * Deletes one gallery file from the app-scope store. Returns true when it is
 * gone (deleted now or already missing). Never throws: the row is already
 * removed, so a failure is logged for follow-up rather than undoing that.
 */
export async function deleteMediaFile(env: Env, key: string): Promise<boolean> {
  if (!MEDIA_KEY_PATTERN.test(key)) {
    console.error(`[files] refused to delete a non-gallery key: ${JSON.stringify(key.slice(0, 120))}`)
    return false
  }
  try {
    const res = await platformWorkerFetch(env, filePath(env, key), { method: 'DELETE', headers: platformHeaders(env) })
    if (res.ok || res.status === 404) return true
    console.error(`[files] deleting ${key} answered ${res.status}`)
  } catch (err) {
    console.error(`[files] deleting ${key} failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return false
}
