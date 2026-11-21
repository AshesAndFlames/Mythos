import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  createArticle,
  deleteArticle,
  renameArticle,
  setArticleCategory,
  setArticleInfobox,
} from './articles'
import { createCategory, deleteCategory, updateCategory } from './categories'
import { createLink, deleteLink } from './links'
import { inviteMember, removeMember, setMemberRole } from './members'
import { restoreRevision, saveRevision } from './revisions'
import { seedExampleUniverse } from './seed'
import { deleteTag, setArticleTags } from './tags'
import { createUniverse, deleteUniverse, updateUniverse } from './universes'

/**
 * Server actions, exposed at POST /api/actions/:name.
 * Every Mythos action is built with `mythosAction` (Zod + role checks).
 */
export const actions: Record<string, ActionHandler<Env>> = {
  // Universes (owner manages settings and deletion)
  createUniverse,
  updateUniverse,
  deleteUniverse,
  // Membership (owner)
  inviteMember,
  setMemberRole,
  removeMember,
  // Articles (editor)
  createArticle,
  renameArticle,
  setArticleCategory,
  setArticleInfobox,
  deleteArticle,
  // Organisation (editor)
  createCategory,
  updateCategory,
  deleteCategory,
  setArticleTags,
  deleteTag,
  // Relationships (editor)
  createLink,
  deleteLink,
  // Revisions (editor)
  saveRevision,
  restoreRevision,
  // Local development only
  seedExampleUniverse,
}
