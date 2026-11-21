import type { ActionTools } from 'deepspace/worker'
import { COLLECTIONS, LIMITS } from '../domain/mythos'
import type { ArticleData, CategoryData } from '../domain/records'
import { mythosAction, UserError } from '../server/mythos/action'
import { requireOwned, requireRole } from '../server/mythos/membership'
import { checkParent } from '../server/mythos/categories'
import { mustSucceed, queryAll, type Envelope } from '../server/mythos/store'
import {
  categoryIdSchema,
  createCategorySchema,
  updateCategorySchema,
} from '../server/mythos/validation'

function universeCategories(tools: ActionTools, universeId: string) {
  return queryAll<CategoryData>(tools, COLLECTIONS.categories, { where: { universeId } })
}

function assertNameFree(all: Envelope<CategoryData>[], parentId: string, name: string, exceptId?: string) {
  const clash = all.some(
    (c) =>
      c.recordId !== exceptId &&
      c.data.parentId === parentId &&
      c.data.name.toLowerCase() === name.toLowerCase(),
  )
  if (clash) throw new UserError('A category with that name already exists here')
}

/** Creates a category, optionally under a parent (editor or owner). */
export const createCategory = mythosAction(
  'createCategory',
  createCategorySchema,
  async ({ userId, params, tools, system }) => {
    await requireRole(tools, userId, params.universeId, 'editor')
    const all = await universeCategories(tools, params.universeId)
    checkParent(all, null, params.parentId)
    assertNameFree(all, params.parentId, params.name)

    const category: CategoryData = {
      universeId: params.universeId,
      name: params.name,
      parentId: params.parentId,
      sortOrder: all.filter((c) => c.data.parentId === params.parentId).length,
    }
    const created = await mustSucceed(
      system.create(COLLECTIONS.categories, { ...category }),
      'Creating the category',
    )
    return { categoryId: created.recordId }
  },
)

/** Renames, moves or reorders a category (editor or owner). */
export const updateCategory = mythosAction(
  'updateCategory',
  updateCategorySchema,
  async ({ userId, params, tools, system }) => {
    const { record } = await requireOwned<CategoryData>(
      tools,
      userId,
      COLLECTIONS.categories,
      params.categoryId,
      'editor',
      'Category',
    )
    const all = await universeCategories(tools, record.data.universeId)
    const parentId = params.parentId ?? record.data.parentId
    const name = params.name ?? record.data.name
    if (params.parentId !== undefined) checkParent(all, record.recordId, parentId)
    if (params.name !== undefined || params.parentId !== undefined) {
      assertNameFree(all, parentId, name, record.recordId)
    }

    const patch: Partial<CategoryData> = {}
    if (params.name !== undefined) patch.name = params.name
    if (params.parentId !== undefined) patch.parentId = params.parentId
    if (params.sortOrder !== undefined) patch.sortOrder = params.sortOrder
    if (Object.keys(patch).length === 0) return { categoryId: record.recordId }

    await mustSucceed(system.update(COLLECTIONS.categories, record.recordId, patch), 'Updating the category')
    return { categoryId: record.recordId }
  },
)

/**
 * Deletes a category (editor or owner). Its child categories move up to its
 * parent and its articles become uncategorised — no content is deleted.
 */
export const deleteCategory = mythosAction(
  'deleteCategory',
  categoryIdSchema,
  async ({ userId, params, tools, system }) => {
    const { record } = await requireOwned<CategoryData>(
      tools,
      userId,
      COLLECTIONS.categories,
      params.categoryId,
      'editor',
      'Category',
    )
    const universeId = record.data.universeId
    const all = await universeCategories(tools, universeId)

    // Keep (universeId, parentId, name) unique as children move up a level.
    const siblingNames = new Set(
      all.filter((c) => c.data.parentId === record.data.parentId).map((c) => c.data.name.toLowerCase()),
    )
    for (const child of all.filter((c) => c.data.parentId === record.recordId)) {
      let name = child.data.name
      for (let n = 1; siblingNames.has(name.toLowerCase()); n++) {
        const suffix = n === 1 ? ` (${record.data.name})` : ` (${record.data.name} ${n})`
        name = `${child.data.name.slice(0, LIMITS.categoryName - suffix.length)}${suffix}`
      }
      siblingNames.add(name.toLowerCase())
      await mustSucceed(
        system.update(COLLECTIONS.categories, child.recordId, { parentId: record.data.parentId, name }),
        'Moving a child category',
      )
    }

    const articles = await queryAll<Pick<ArticleData, 'categoryId'>>(tools, COLLECTIONS.articles, {
      where: { universeId, categoryId: record.recordId },
    })
    for (const a of articles) {
      await mustSucceed(system.update(COLLECTIONS.articles, a.recordId, { categoryId: '' }), 'Clearing a category')
    }

    await mustSucceed(system.remove(COLLECTIONS.categories, record.recordId), 'Deleting the category')
    return { categoryId: record.recordId }
  },
)
