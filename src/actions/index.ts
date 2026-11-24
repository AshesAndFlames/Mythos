import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  createArticle,
  deleteArticle,
  renameArticle,
  saveArticle,
  setArticleCategory,
  setArticleInfobox,
} from './articles'
import { createCategory, deleteCategory, updateCategory } from './categories'
import { setAccountSettings } from './account'
import { createLink, deleteLink } from './links'
import { addMedia, deleteMedia, setArticleMedia, updateMedia } from './media'
import {
  inviteMember,
  listInvitations,
  myInvitations,
  removeMember,
  respondToInvitation,
  revokeInvitation,
  setMemberRole,
} from './members'
import { getPublicArticle, getPublicUniverse, joinPublicUniverse, listPublicUniverses } from './public'
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
  // Membership (owner; removeMember also lets a member leave)
  inviteMember,
  listInvitations,
  revokeInvitation,
  setMemberRole,
  removeMember,
  // Invitations (the invitee, matched by account email)
  myInvitations,
  respondToInvitation,
  // Public universes (any signed-in user; public or member only)
  listPublicUniverses,
  getPublicUniverse,
  getPublicArticle,
  joinPublicUniverse,
  // Articles (editor)
  createArticle,
  renameArticle,
  saveArticle,
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
  // Maps and images (editor; ADR-025)
  addMedia,
  updateMedia,
  deleteMedia,
  setArticleMedia,
  // Account settings (the caller's own; ADR-026)
  setAccountSettings,
  // Revisions (editor)
  saveRevision,
  restoreRevision,
  // Local development only
  seedExampleUniverse,
}
