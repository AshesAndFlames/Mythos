import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createArticle, deleteArticle, renameArticle } from './articles'
import { inviteMember, removeMember, setMemberRole } from './members'
import { createUniverse } from './universes'

/**
 * Server actions, exposed at POST /api/actions/:name.
 * Every Mythos action is built with `mythosAction` (Zod + role checks).
 */
export const actions: Record<string, ActionHandler<Env>> = {
  createUniverse,
  inviteMember,
  setMemberRole,
  removeMember,
  createArticle,
  renameArticle,
  deleteArticle,
}
