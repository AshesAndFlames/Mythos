/** Pure helpers for universe roles. No I/O; unit-tested. */

import { UNIVERSE_ROLES, type UniverseRole } from '../../domain/mythos'

export function roleRank(role: UniverseRole): number {
  return UNIVERSE_ROLES.indexOf(role)
}

/** True when `role` is at least `minimum` (viewer < editor < owner). */
export function hasAtLeast(role: UniverseRole | null | undefined, minimum: UniverseRole): boolean {
  if (!role) return false
  return roleRank(role) >= roleRank(minimum)
}

export function isUniverseRole(value: unknown): value is UniverseRole {
  return typeof value === 'string' && (UNIVERSE_ROLES as readonly string[]).includes(value)
}

/**
 * The `editorIds` list for a universe: everyone who may edit its content.
 * Owners and editors, deduplicated and sorted so fan-outs can skip rows that
 * already hold the same list.
 */
export function computeEditorIds(
  members: ReadonlyArray<{ userId: string; role: UniverseRole; active: boolean }>,
): string[] {
  const ids = new Set<string>()
  for (const m of members) {
    if (m.active && hasAtLeast(m.role, 'editor')) ids.add(m.userId)
  }
  return [...ids].sort()
}

export function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false
  const sorted = [...a].sort()
  return sorted.every((id, i) => id === b[i])
}
