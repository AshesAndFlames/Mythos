/**
 * Library filters, kept in component state and mirrored into the URL.
 *
 * The URL makes a filtered library shareable and reload-safe, but it cannot
 * be the source of truth while someone types: router updates land
 * asynchronously, and React Router's functional `setSearchParams` reads the
 * committed location, so two quick changes (clear the search, then pick a
 * type) would drop one. Here state is the truth; the URL follows it, and a
 * URL change this hook did not write (a category link in the sidebar, back /
 * forward) is adopted.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ARTICLE_TYPES, type ArticleType } from '@/domain/mythos'

export const SORTS = {
  updated: 'Recently updated',
  created: 'Newest first',
  title: 'Title A–Z',
} as const
export type SortKey = keyof typeof SORTS

export interface LibraryFilters {
  q: string
  type: ArticleType | ''
  category: string
  sort: SortKey
}

/** How long a URL this hook wrote may take to arrive and still count as its own. */
const WRITE_SETTLE_MS = 2000

export const EMPTY_FILTERS: LibraryFilters = { q: '', type: '', category: '', sort: 'updated' }

export function parseFilters(params: URLSearchParams): LibraryFilters {
  const type = params.get('type') ?? ''
  const sort = params.get('sort') ?? ''
  return {
    q: params.get('q') ?? '',
    type: (ARTICLE_TYPES as readonly string[]).includes(type) ? (type as ArticleType) : '',
    category: params.get('category') ?? '',
    sort: sort in SORTS ? (sort as SortKey) : 'updated',
  }
}

/** Query string for filters, omitting defaults. Stable key order. */
export function serializeFilters(f: LibraryFilters): string {
  const out = new URLSearchParams()
  if (f.q) out.set('q', f.q)
  if (f.type) out.set('type', f.type)
  if (f.category) out.set('category', f.category)
  if (f.sort !== 'updated') out.set('sort', f.sort)
  return out.toString()
}

export function useLibraryFilters() {
  const [params, setParams] = useSearchParams()
  const url = params.toString()
  const [filters, setFilters] = useState<LibraryFilters>(() => parseFilters(params))
  /**
   * Query strings this hook wrote recently → when. Their (possibly late)
   * arrival is not an outside change; anything else, including an old string
   * reached through a link, is.
   */
  const written = useRef(new Map<string, number>())
  /** The last query string this hook asked for. */
  const last = useRef(url)

  useEffect(() => {
    const at = written.current.get(url)
    if (url === last.current || (at !== undefined && Date.now() - at < WRITE_SETTLE_MS)) return
    written.current.clear()
    last.current = url
    setFilters(parseFilters(new URLSearchParams(url)))
  }, [url])

  useEffect(() => {
    const next = serializeFilters(filters)
    if (next === last.current) return
    last.current = next
    written.current.set(next, Date.now())
    setParams(new URLSearchParams(next), { replace: true })
  }, [filters, setParams])

  const update = useCallback((patch: Partial<LibraryFilters>) => setFilters((f) => ({ ...f, ...patch })), [])
  const reset = useCallback(() => setFilters(EMPTY_FILTERS), [])
  return { filters, update, reset }
}
