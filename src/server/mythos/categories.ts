/** Category-tree rules. Pure; unit-tested. */

import { LIMITS } from '../../domain/mythos'
import type { CategoryData } from '../../domain/records'
import { UserError } from './errors'
import type { Envelope } from './store'

/**
 * Checks a proposed parent: it must exist in the same universe, must not be
 * the category itself or one of its descendants, and must keep the tree
 * within LIMITS.categoryDepth levels.
 */
export function checkParent(
  all: Envelope<CategoryData>[],
  categoryId: string | null,
  parentId: string,
): void {
  if (!parentId) return
  const byId = new Map(all.map((c) => [c.recordId, c]))
  if (!byId.has(parentId)) throw new UserError('Parent category not found')

  // Depth of the new parent's chain (and cycle check when moving).
  let depth = 1
  for (let id: string = parentId; id; id = byId.get(id)?.data.parentId ?? '') {
    if (id === categoryId) throw new UserError('A category cannot be placed inside itself')
    depth++
    if (depth > LIMITS.categoryDepth + 1) break
  }

  // Height of the subtree being moved (1 for a new category).
  let height = 1
  if (categoryId) {
    const childrenOf = (id: string) => all.filter((c) => c.data.parentId === id)
    const walk = (id: string, h: number): void => {
      if (h > height) height = h
      if (h > LIMITS.categoryDepth) return
      for (const c of childrenOf(id)) walk(c.recordId, h + 1)
    }
    walk(categoryId, 1)
  }
  if (depth - 1 + height > LIMITS.categoryDepth) {
    throw new UserError(`Categories can be nested at most ${LIMITS.categoryDepth} levels deep`)
  }
}

