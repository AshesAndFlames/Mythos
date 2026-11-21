/** The universe a /u/:universeId page is inside, resolved once by its layout. */

import { useOutletContext } from 'react-router-dom'
import type { UniverseRole } from '@/domain/mythos'
import type { UniverseView } from './hooks'

export interface UniverseContext {
  universe: UniverseView
  role: UniverseRole
  /** Opens the "New article" dialog (editors and owners). */
  newArticle: () => void
}

export function useUniverseContext(): UniverseContext {
  return useOutletContext<UniverseContext>()
}
