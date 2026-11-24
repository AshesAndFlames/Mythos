/**
 * Data for the public universe pages (ADR-024). Non-members cannot use the
 * RecordRoom hooks, so these pages load once through the public read
 * actions; `reload` fetches again (for example after joining).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { UniverseRole, UniverseVisibility } from '@/domain/mythos'
import type { PublicArticleSummary, PublicCategory, PublicConnection, PublicUniverseSummary } from '@/domain/public'
import type { RichTextNode } from '@/domain/records'
import { callAction } from '@/lib/actions'
import type { LoadStatus } from '@/features/universes/hooks'

export interface ActionData<T> {
  data: T | null
  status: LoadStatus
  error: string | null
  reload: () => Promise<void>
}

/** Calls `name` with `params` on mount and whenever `params` change by value. */
export function useActionData<T>(name: string, params: Record<string, unknown>): ActionData<T> {
  const key = JSON.stringify(params)
  const [state, setState] = useState<{ data: T | null; status: LoadStatus; error: string | null }>({
    data: null,
    status: 'loading',
    error: null,
  })
  // Ignore answers to requests that a newer one has replaced.
  const latest = useRef(0)

  const load = useCallback(async () => {
    const id = ++latest.current
    const res = await callAction<T>(name, JSON.parse(key) as Record<string, unknown>)
    if (id !== latest.current) return
    setState(res.ok ? { data: res.data, status: 'ready', error: null } : { data: null, status: 'error', error: res.error })
  }, [name, key])

  useEffect(() => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    void load()
  }, [load])

  return { ...state, reload: load }
}

export interface PublicUniverseDetails {
  id: string
  name: string
  tagline: string
  description: string
  coverImageKey: string
  visibility: UniverseVisibility
  ownerName: string
  updatedAt: string
}

export interface PublicUniverseData {
  universe: PublicUniverseDetails
  myRole: UniverseRole | null
  articles: PublicArticleSummary[]
  categories: PublicCategory[]
}

export interface PublicArticleData {
  universe: { id: string; name: string }
  myRole: UniverseRole | null
  article: {
    id: string
    title: string
    type: PublicArticleSummary['type']
    summary: string
    coverImageKey: string
    categoryName: string
    tags: string[]
    authorName: string
    createdAt: string
    updatedAt: string
    content: RichTextNode | null
  }
  connections: PublicConnection[]
  related: PublicArticleSummary[]
}

export function usePublicUniverses(query: string) {
  return useActionData<{ universes: PublicUniverseSummary[]; total: number }>('listPublicUniverses', { query })
}

export function usePublicUniverse(universeId: string) {
  return useActionData<PublicUniverseData>('getPublicUniverse', { universeId })
}

export function usePublicArticle(universeId: string, articleId: string) {
  return useActionData<PublicArticleData>('getPublicArticle', { universeId, articleId })
}
