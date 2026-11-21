/**
 * Picks and uploads a cover image to the app file store under a key Mythos
 * chooses (`covers/<universeId>/<uuid>.<ext>`), then reports the key. The
 * worker accepts it only from an owner or editor of that universe. Saving the key on a
 * universe or article is a server action, which validates it again.
 */

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useR2Files } from 'deepspace'
import { COVER_KEY_PATTERN, COVER_MAX_BYTES, COVER_MIME_TYPES } from '@/domain/mythos'
import { Button } from '@/components/ui'
import { useUniverseContext } from '@/features/universes/context'
import { CoverImage } from './CoverImage'

const EXT: Record<(typeof COVER_MIME_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function isCoverMime(type: string): type is (typeof COVER_MIME_TYPES)[number] {
  return (COVER_MIME_TYPES as readonly string[]).includes(type)
}

/** Validates a file and uploads it. Resolves to the new key, or throws a user-facing Error. */
export function useCoverUpload() {
  const { upload } = useR2Files({ scope: 'app' })
  const { universe } = useUniverseContext()
  return async (file: File): Promise<string> => {
    if (!isCoverMime(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.')
    if (file.size > COVER_MAX_BYTES) throw new Error('Cover images must be 5 MB or smaller.')
    const key = `covers/${universe.id}/${crypto.randomUUID()}.${EXT[file.type]}`
    const res = await upload(file, file.name, { key })
    if (!res.success) throw new Error(res.error ?? 'The image could not be uploaded.')
    if (!COVER_KEY_PATTERN.test(key)) throw new Error('The image could not be uploaded.')
    return key
  }
}

export function CoverPicker({
  value,
  title,
  seed,
  disabled,
  onChange,
  onError,
  aspect = 'aspect-[3/1]',
}: {
  value: string
  title: string
  seed: string
  disabled?: boolean
  /** Called with the new key ('' to remove). */
  onChange: (key: string) => void | Promise<void>
  onError: (message: string) => void
  aspect?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const uploadCover = useCoverUpload()
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const key = await uploadCover(file)
      await onChange(key)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'The image could not be uploaded.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className={`relative overflow-hidden rounded-xl border border-border ${aspect}`}>
        <CoverImage imageKey={value} title={title || 'Untitled'} seed={seed} />
        {busy && (
          <div role="status" className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-foreground">
            Uploading…
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={COVER_MIME_TYPES.join(',')}
          className="sr-only"
          aria-label="Cover image file"
          data-testid="cover-file-input"
          onChange={(e) => void pick(e.target.files?.[0])}
          disabled={disabled || busy}
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => input.current?.click()}>
          <ImagePlus className="size-4" aria-hidden />
          {value ? 'Replace cover' : 'Add cover'}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void onChange('')}>
            <Trash2 className="size-4" aria-hidden />
            Remove cover
          </Button>
        )}
      </div>
    </div>
  )
}
