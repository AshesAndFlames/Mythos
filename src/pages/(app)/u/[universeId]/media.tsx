/**
 * Maps & Images (ADR-025): the universe's gallery. Every member browses it;
 * editors and owners upload, edit and delete (the server checks the role).
 */

import { useMemo, useState } from 'react'
import { ImagePlus, Images } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { MediaGrid, MediaUploadDialog, MediaViewer } from '@/components/mythos/Media'
import { CardGridSkeleton } from '@/components/mythos/Skeleton'
import { ErrorView } from '@/components/mythos/StatusViews'
import { LIMITS, MEDIA_KIND_LABELS, MEDIA_KINDS, type MediaKind } from '@/domain/mythos'
import { useUniverseContext } from '@/features/universes/context'
import { useMedia } from '@/features/universes/hooks'
import { hasAtLeast } from '@/server/mythos/roles'
import { cn } from '@/lib/utils'

export default function UniverseMediaPage() {
  const { universe, role } = useUniverseContext()
  const canEdit = hasAtLeast(role, 'editor')
  const { media, status } = useMedia(universe.id)
  const [filter, setFilter] = useState<MediaKind | ''>('')
  const [uploading, setUploading] = useState(false)
  // Hold the id, not the row, so the viewer shows edits as they sync.
  const [openId, setOpenId] = useState<string | null>(null)

  const shown = useMemo(() => (filter ? media.filter((m) => m.kind === filter) : media), [media, filter])
  const open = media.find((m) => m.id === openId) ?? null
  const full = media.length >= LIMITS.mediaPerUniverse

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mythos-eyebrow">{universe.name}</p>
          <h1 className="mt-1 text-4xl font-semibold text-foreground">Maps & Images</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canEdit
              ? 'Upload maps and artwork here, then show them on articles from the editor.'
              : 'Maps and artwork for this universe.'}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setUploading(true)} disabled={full} data-testid="media-upload-open">
            <ImagePlus className="size-4" aria-hidden /> Add map or image
          </Button>
        )}
      </header>
      {canEdit && full && (
        <p className="text-sm text-muted-foreground">
          The gallery is full ({LIMITS.mediaPerUniverse} items). Delete something to add more.
        </p>
      )}

      {media.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
          {(['', ...MEDIA_KINDS] as const).map((k) => (
            <button
              key={k || 'all'}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                filter === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {k ? `${MEDIA_KIND_LABELS[k]}s` : 'All'}
              <span className="ml-1.5 text-xs opacity-70">{k ? media.filter((m) => m.kind === k).length : media.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="@container">
        {status === 'loading' ? (
          <CardGridSkeleton count={6} label="Loading the gallery…" />
        ) : status === 'error' ? (
          <ErrorView message="The gallery could not be loaded. Refresh to try again." />
        ) : media.length === 0 ? (
          <EmptyState
            icon={<Images className="size-6" />}
            title="No maps or images yet"
            description={canEdit ? 'Upload a map of your world, or artwork of its people and places.' : 'Editors have not added any yet.'}
            action={canEdit ? { label: 'Add map or image', onClick: () => setUploading(true) } : undefined}
          />
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing of that kind yet.</p>
        ) : (
          <MediaGrid items={shown} onOpen={(m) => setOpenId(m.id)} />
        )}
      </div>

      {canEdit && <MediaUploadDialog open={uploading} onClose={() => setUploading(false)} universeId={universe.id} />}
      <MediaViewer item={open} onClose={() => setOpenId(null)} canEdit={canEdit} />
    </div>
  )
}
