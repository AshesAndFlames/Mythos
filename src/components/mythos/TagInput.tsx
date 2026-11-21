/** Tag entry: type and press Enter or comma; Backspace on an empty field removes the last tag. */

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { LIMITS } from '@/domain/mythos'

export function TagInput({
  value,
  onChange,
  suggestions,
  disabled,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const full = value.length >= LIMITS.tags
  const lower = new Set(value.map((t) => t.toLowerCase()))
  const needle = draft.trim().toLowerCase()
  const matches = needle ? suggestions.filter((s) => s.toLowerCase().includes(needle) && !lower.has(s.toLowerCase())).slice(0, 6) : []

  function add(raw: string) {
    const tag = raw.trim().replace(/^#/, '').slice(0, LIMITS.tag)
    setDraft('')
    if (!tag || lower.has(tag.toLowerCase()) || full) return
    onChange([...value, tag])
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            #{t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              disabled={disabled}
              onClick={() => onChange(value.filter((x) => x !== t))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          aria-label="Add a tag"
          value={draft}
          disabled={disabled || full}
          maxLength={LIMITS.tag}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={full ? `At most ${LIMITS.tags} tags` : value.length ? '' : 'Add tags…'}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1" aria-label="Existing tags">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(m)}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              #{m}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
