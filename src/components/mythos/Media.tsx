/**
 * Maps and images (ADR-025): rendering, uploading, viewing and attaching
 * gallery items. Uploads go through the checked `/api/files` proxy (owner or
 * editor, 15 MB, PNG/JPEG/WebP/GIF, daily cap); every write after that is a
 * server action that checks the role again. Hidden controls are UX only.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, ImageOff, ImagePlus, Map as MapIcon, Trash2, X } from 'lucide-react'
import { useR2Files } from 'deepspace'
import { Button, Input, Label, Modal, Textarea, useToast } from '@/components/ui'
import { APP_ID } from '@/constants'
import {
  COVER_MIME_TYPES,
  LIMITS,
  MEDIA_KEY_PATTERN,
  MEDIA_KIND_LABELS,
  MEDIA_KINDS,
  MEDIA_MAX_BYTES,
  mediaUrl,
  type MediaKind,
} from '@/domain/mythos'
import { callAction } from '@/lib/actions'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from './Dialogs'
import { FormError, selectClass } from './StatusViews'

/** What the gallery components need of an item (live rows and public-page items both fit). */
export interface MediaItem {
  id: string
  key: string
  title: string
  caption: string
  kind: MediaKind
}

const EXT: Record<(typeof COVER_MIME_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const isImageMime = (type: string): type is (typeof COVER_MIME_TYPES)[number] =>
  (COVER_MIME_TYPES as readonly string[]).includes(type)

/** A gallery image by key; keys are validated by `mediaUrl`, so a stored value never becomes an arbitrary URL. */
export function MediaImage({
  imageKey,
  alt,
  className,
  fit = 'cover',
}: {
  imageKey: string
  alt: string
  className?: string
  fit?: 'cover' | 'contain'
}) {
  const src = mediaUrl(imageKey, APP_ID)
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-muted text-muted-foreground', className)}>
        <ImageOff className="size-6" aria-hidden />
        <span className="sr-only">{alt} could not be loaded</span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain', className)}
    />
  )
}

function KindBadge({ kind, className }: { kind: MediaKind; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur',
        className,
      )}
    >
      {kind === 'map' && <MapIcon className="size-3" aria-hidden />}
      {MEDIA_KIND_LABELS[kind]}
    </span>
  )
}

// ── Upload ────────────────────────────────────────────────────────────────

/** Uploads a gallery file for `universeId`. Resolves to its key, or throws a user-facing Error. */
function useMediaUpload(universeId: string) {
  const { upload } = useR2Files({ scope: 'app' })
  return async (file: File): Promise<string> => {
    if (!isImageMime(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.')
    if (file.size > MEDIA_MAX_BYTES) throw new Error('Maps and images must be 15 MB or smaller.')
    const key = `media/${universeId}/${crypto.randomUUID()}.${EXT[file.type]}`
    if (!MEDIA_KEY_PATTERN.test(key)) throw new Error('The image could not be uploaded.')
    const res = await upload(file, file.name, { key })
    if (!res.success) throw new Error(res.error ?? 'The image could not be uploaded.')
    return key
  }
}

const titleFromFile = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, LIMITS.mediaTitle)

export function MediaUploadDialog({ open, onClose, universeId }: { open: boolean; onClose: () => void; universeId: string }) {
  const toast = useToast()
  const uploadFile = useMediaUpload(universeId)
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [kind, setKind] = useState<MediaKind>('map')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function reset() {
    setFile(null)
    setTitle('')
    setCaption('')
    setKind('map')
    setError(null)
    if (input.current) input.current.value = ''
  }
  function close() {
    if (busy) return
    reset()
    onClose()
  }

  function choose(f: File | undefined) {
    setError(null)
    if (!f) return setFile(null)
    if (!isImageMime(f.type)) return setError('Choose a PNG, JPEG, WebP or GIF image.')
    if (f.size > MEDIA_MAX_BYTES) return setError('Maps and images must be 15 MB or smaller.')
    setFile(f)
    if (!title) setTitle(titleFromFile(f.name))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Choose an image to upload.')
    setBusy(true)
    setError(null)
    try {
      const key = await uploadFile(file)
      const res = await callAction<{ mediaId: string }>('addMedia', { universeId, key, title, caption, kind })
      if (!res.ok) throw new Error(res.error)
      toast.success(`${MEDIA_KIND_LABELS[kind]} added to the gallery`)
      setBusy(false)
      reset()
      onClose()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'The image could not be uploaded.')
    }
  }

  return (
    <Modal open={open} onClose={close} size="lg">
      <form onSubmit={submit} className="flex min-h-0 flex-col">
        <Modal.Header>
          <Modal.Title>Add a map or image</Modal.Title>
          <Modal.Description>PNG, JPEG, WebP or GIF, up to 15 MB.</Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="media-file">Image</Label>
            <input
              id="media-file"
              ref={input}
              type="file"
              accept={COVER_MIME_TYPES.join(',')}
              onChange={(e) => choose(e.target.files?.[0])}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
              data-testid="media-file-input"
            />
            {preview && (
              <div className="mt-2 aspect-[16/9] overflow-hidden rounded-lg border border-border bg-muted">
                <img src={preview} alt="Preview of the chosen image" className="h-full w-full object-contain" />
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="media-title">Title</Label>
              <Input id="media-title" value={title} maxLength={LIMITS.mediaTitle} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="media-kind">Kind</Label>
              <select id="media-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as MediaKind)}>
                {MEDIA_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MEDIA_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media-caption">Caption (optional)</Label>
            <Textarea id="media-caption" rows={3} value={caption} maxLength={LIMITS.mediaCaption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <FormError message={error} testId="media-upload-error" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!file || !title.trim()} data-testid="media-upload-submit">
            <ImagePlus className="size-4" aria-hidden /> Upload
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

// ── Grid and viewer ───────────────────────────────────────────────────────

export function MediaGrid({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  return (
    <ul className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3" data-testid="media-grid">
      {items.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onOpen(m)}
            data-testid="media-card"
            className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-[var(--shadow-card)] transition hover:border-primary/40"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              <MediaImage imageKey={m.key} alt={m.title} className="transition duration-500 group-hover:scale-[1.02] motion-reduce:transition-none" />
              <KindBadge kind={m.kind} className="absolute left-2 top-2" />
            </div>
            <div className="p-3">
              <p className="truncate font-display text-lg font-semibold text-foreground">{m.title}</p>
              {m.caption && <p className="line-clamp-2 text-sm text-muted-foreground">{m.caption}</p>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Full-size view of one item. Editors can change its details or delete it. */
export function MediaViewer({ item, onClose, canEdit }: { item: MediaItem | null; onClose: () => void; canEdit: boolean }) {
  return (
    <Modal open={item !== null} onClose={onClose} size="xl">
      {item && <MediaViewerBody key={item.id} item={item} onClose={onClose} canEdit={canEdit} />}
    </Modal>
  )
}

function MediaViewerBody({ item, onClose, canEdit }: { item: MediaItem; onClose: () => void; canEdit: boolean }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [caption, setCaption] = useState(item.caption)
  const [kind, setKind] = useState<MediaKind>(item.kind)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const full = mediaUrl(item.key, APP_ID)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction('updateMedia', { mediaId: item.id, title, caption, kind })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    toast.success('Details saved')
    setEditing(false)
  }

  return (
    <>
      <Modal.Header>
        <Modal.Title className="flex items-center gap-2">
          {item.title} <KindBadge kind={item.kind} />
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="space-y-4">
        <div className="max-h-[60vh] overflow-hidden rounded-lg border border-border bg-muted">
          <MediaImage imageKey={item.key} alt={item.title} fit="contain" className="max-h-[60vh]" />
        </div>
        {editing ? (
          <form onSubmit={save} className="space-y-3" aria-label="Edit image details">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="media-edit-title">Title</Label>
                <Input id="media-edit-title" value={title} maxLength={LIMITS.mediaTitle} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="media-edit-kind">Kind</Label>
                <select id="media-edit-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as MediaKind)}>
                  {MEDIA_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {MEDIA_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="media-edit-caption">Caption</Label>
              <Textarea id="media-edit-caption" rows={3} value={caption} maxLength={LIMITS.mediaCaption} onChange={(e) => setCaption(e.target.value)} />
            </div>
            <FormError message={error} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          item.caption && <p className="whitespace-pre-line text-sm text-foreground">{item.caption}</p>
        )}
      </Modal.Body>
      <Modal.Footer className="flex-wrap">
        {full && (
          <a href={full} target="_blank" rel="noopener noreferrer" className="mr-auto inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ExternalLink className="size-4" aria-hidden /> Open full size
          </a>
        )}
        {canEdit && !editing && (
          <>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            <Button variant="destructive" onClick={() => setConfirming(true)} data-testid="media-delete">
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete “${item.title}”?`}
        description="It is removed from the gallery and from every article that shows it, and the file is deleted. This cannot be undone."
        confirmText="Delete"
        onConfirm={async () => {
          const res = await callAction('deleteMedia', { mediaId: item.id })
          if (!res.ok) return res.error
          toast.success(`“${item.title}” was deleted`)
          onClose()
          return null
        }}
      />
    </>
  )
}

// ── On articles ───────────────────────────────────────────────────────────

/** The images an article shows, with a viewer (read only: editing happens in the gallery). */
export function ArticleMediaStrip({ items }: { items: MediaItem[] }) {
  const [open, setOpen] = useState<MediaItem | null>(null)
  if (items.length === 0) return null
  return (
    <section aria-labelledby="article-media-heading" className="space-y-3" data-testid="article-media">
      <h2 id="article-media-heading" className="mythos-eyebrow">
        Maps & images
      </h2>
      <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        {items.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setOpen(m)}
              className="group block w-full overflow-hidden rounded-lg border border-border text-left transition hover:border-primary/40"
            >
              <div className="relative aspect-[4/3] bg-muted">
                <MediaImage imageKey={m.key} alt={m.title} />
                <KindBadge kind={m.kind} className="absolute left-1.5 top-1.5" />
              </div>
              <p className="truncate px-2 py-1.5 text-sm text-foreground">{m.title}</p>
            </button>
          </li>
        ))}
      </ul>
      <MediaViewer item={open} onClose={() => setOpen(null)} canEdit={false} />
    </section>
  )
}

/**
 * The editor's "Maps & images" section: the images the article shows, in
 * order, with add (from the gallery), reorder and remove. Each change saves
 * through `setArticleMedia`.
 */
export function ArticleMediaPicker({
  articleId,
  attached,
  gallery,
  galleryHref,
}: {
  articleId: string
  attached: MediaItem[]
  gallery: MediaItem[]
  galleryHref: string
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const ids = attached.map((m) => m.id)

  async function save(next: string[]) {
    setBusy(true)
    const res = await callAction('setArticleMedia', { articleId, mediaIds: next })
    setBusy(false)
    if (!res.ok) toast.error(res.error)
  }
  const move = (i: number, by: number) => {
    const next = [...ids]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    void save(next)
  }

  return (
    <section aria-labelledby="media-picker-heading" className="space-y-3 rounded-xl border border-border bg-card p-4" data-testid="article-media-picker">
      <div className="flex items-center justify-between gap-2">
        <h3 id="media-picker-heading" className="font-semibold text-foreground">
          Maps & images
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setChoosing(true)}
          disabled={busy || ids.length >= LIMITS.mediaPerArticle}
          data-testid="article-media-add"
        >
          <ImagePlus className="size-4" aria-hidden /> Add from gallery
        </Button>
      </div>
      {attached.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images on this article yet.</p>
      ) : (
        <ol className="space-y-2">
          {attached.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-2" data-testid="article-media-item">
              <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                <MediaImage imageKey={m.key} alt={m.title} />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.title}</span>
              <Button size="icon" variant="ghost" aria-label={`Move ${m.title} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Move ${m.title} down`} disabled={busy || i === attached.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Remove ${m.title} from this article`} disabled={busy} onClick={() => void save(ids.filter((id) => id !== m.id))}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <GalleryChooser
        open={choosing}
        onClose={() => setChoosing(false)}
        gallery={gallery.filter((m) => !ids.includes(m.id))}
        room={LIMITS.mediaPerArticle - ids.length}
        galleryHref={galleryHref}
        onChoose={async (chosen) => {
          await save([...ids, ...chosen])
          setChoosing(false)
        }}
      />
    </section>
  )
}

function GalleryChooser({
  open,
  onClose,
  gallery,
  room,
  galleryHref,
  onChoose,
}: {
  open: boolean
  onClose: () => void
  gallery: MediaItem[]
  room: number
  galleryHref: string
  onChoose: (ids: string[]) => Promise<void>
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < room ? [...p, id] : p))
  const close = () => {
    setPicked([])
    onClose()
  }

  return (
    <Modal open={open} onClose={close} size="lg">
      <Modal.Header>
        <Modal.Title>Add from the gallery</Modal.Title>
        <Modal.Description>
          Choose up to {room} more. New maps and images are uploaded on the universe's{' '}
          <a href={galleryHref} className="text-primary hover:underline">
            Maps & Images
          </a>{' '}
          page.
        </Modal.Description>
      </Modal.Header>
      <Modal.Body>
        {gallery.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything in the gallery is already on this article, or the gallery is empty.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((m) => {
              const on = picked.includes(m.id)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(m.id)}
                    className={cn(
                      'block w-full overflow-hidden rounded-lg border text-left transition',
                      on ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <div className="aspect-[4/3] bg-muted">
                      <MediaImage imageKey={m.key} alt={m.title} />
                    </div>
                    <p className="truncate px-2 py-1.5 text-sm text-foreground">{m.title}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={picked.length === 0}
          onClick={async () => {
            setBusy(true)
            await onChoose(picked)
            setBusy(false)
            setPicked([])
          }}
          data-testid="gallery-chooser-add"
        >
          Add {picked.length > 0 ? picked.length : ''}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
