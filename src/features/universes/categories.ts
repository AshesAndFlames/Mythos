import { LIMITS } from '@/domain/mythos'
import type { CategoryView } from './hooks'

export interface CategoryOption {
  id: string
  label: string
  depth: number
}

/**
 * Categories in tree order, each labelled with em-space indentation by depth
 * (for <select> options). A category whose parent is missing is shown at the
 * top level rather than hidden.
 */
export function categoryOptions(categories: CategoryView[]): CategoryOption[] {
  const out: CategoryOption[] = []
  const ids = new Set(categories.map((c) => c.id))
  const seen = new Set<string>()
  const walk = (parentId: string, depth: number) => {
    for (const c of categories) {
      const parent = ids.has(c.parentId) ? c.parentId : ''
      if (parent !== parentId || seen.has(c.id)) continue
      seen.add(c.id)
      out.push({ id: c.id, label: `${' '.repeat(depth)}${c.name}`, depth })
      if (depth < LIMITS.categoryDepth) walk(c.id, depth + 1)
    }
  }
  walk('', 0)
  return out
}
