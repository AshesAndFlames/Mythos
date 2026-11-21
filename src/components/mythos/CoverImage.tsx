/**
 * A cover image, or — when there is none, or it fails to load — an ornamental
 * monogram plate derived from the title. Keys are validated by `coverUrl`, so
 * a stored value can never become an arbitrary URL.
 */

import { useState } from 'react'
import { APP_ID } from '@/constants'
import { coverUrl } from '@/domain/mythos'
import { monogram } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Stable hue (0–359) from a string, for the fallback plate. */
function hueOf(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

export function CoverImage({
  imageKey,
  title,
  seed,
  className,
  monogramClassName,
}: {
  imageKey?: string | null
  title: string
  /** Varies the fallback plate's tint; defaults to the title. */
  seed?: string
  className?: string
  monogramClassName?: string
}) {
  const src = coverUrl(imageKey, APP_ID)
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }

  const hue = hueOf(seed ?? title)
  return (
    <div
      aria-hidden
      className={cn('relative flex h-full w-full items-center justify-center overflow-hidden', className)}
      style={{
        // Lightness comes from the theme, so the plate suits dark and light pages.
        background: `radial-gradient(circle at 30% 20%, hsl(${hue} 35% var(--cover-tint-l) / 0.9), transparent 60%),
          radial-gradient(circle at 80% 90%, hsl(${(hue + 40) % 360} 30% var(--cover-shade-l) / 0.9), transparent 55%),
          var(--color-card)`,
      }}
    >
      <div className="absolute inset-3 rounded-[inherit] border border-primary/15" />
      <span className={cn('font-display text-5xl text-primary/70', monogramClassName)}>{monogram(title)}</span>
    </div>
  )
}
