/** Creation and confirmation dialogs. Each calls a validated server action. */

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ConfirmModal, Input, Label, Modal, Textarea, useToast } from '@/components/ui'
import { ARTICLE_TYPE_LABELS, ARTICLE_TYPES, LIMITS, type ArticleType } from '@/domain/mythos'
import { callAction } from '@/lib/actions'
import { FormError, selectClass } from './StatusViews'

/** Confirmation before a destructive action. Shows the action's error inline. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmText = 'Delete',
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirmText?: string
  /** Resolve to an error message to keep the dialog open, or null when done. */
  onConfirm: () => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  return (
    <ConfirmModal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      confirmText={confirmText}
      loading={busy}
      onConfirm={async () => {
        setBusy(true)
        const error = await onConfirm()
        setBusy(false)
        if (error) toast.error(error)
        else onClose()
      }}
    />
  )
}

/** Destructive confirmation that requires typing a name. */
export function TypeToConfirmDialog({
  open,
  onClose,
  title,
  description,
  expected,
  confirmText,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  expected: string
  confirmText: string
  onConfirm: (typed: string) => Promise<string | null>
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setTyped('')
      setError(null)
    }
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await onConfirm(typed)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="sm">
      <form onSubmit={submit}>
        <Modal.Header>
          <Modal.Title>{title}</Modal.Title>
          <Modal.Description>{description}</Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-2">
          <Label htmlFor="confirm-name">
            Type <span className="font-semibold text-foreground">{expected}</span> to confirm
          </Label>
          <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <FormError message={error} testId="confirm-error" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" loading={busy} disabled={typed.trim() !== expected.trim()}>
            {confirmText}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

export function CreateUniverseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction<{ universeId: string }>('createUniverse', { name, tagline, description })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    toast.success(`${name.trim()} has been founded`)
    setName('')
    setTagline('')
    setDescription('')
    onClose()
    navigate(`/u/${res.data.universeId}`)
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="md">
      <form onSubmit={submit}>
        <Modal.Header>
          <Modal.Title>Found a new universe</Modal.Title>
          <Modal.Description>A private world for you and the collaborators you invite.</Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="universe-name">Name</Label>
            <Input
              id="universe-name"
              value={name}
              maxLength={LIMITS.universeName}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Shattered Isles"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="universe-tagline">Tagline</Label>
            <Input
              id="universe-tagline"
              value={tagline}
              maxLength={LIMITS.universeTagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Where the old gods drowned"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="universe-description">Description</Label>
            <Textarea
              id="universe-description"
              value={description}
              maxLength={LIMITS.universeDescription}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What is this world about?"
            />
          </div>
          <FormError message={error} testId="create-universe-error" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            Create universe
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

export function NewArticleDialog({
  open,
  onClose,
  universeId,
  defaultType = 'character',
}: {
  open: boolean
  onClose: () => void
  universeId: string
  defaultType?: ArticleType
}) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ArticleType>(defaultType)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setType(defaultType)
      setError(null)
    }
  }, [open, defaultType])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await callAction<{ articleId: string }>('createArticle', { universeId, title, type })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setTitle('')
    onClose()
    navigate(`/u/${universeId}/a/${res.data.articleId}/edit`)
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="sm">
      <form onSubmit={submit}>
        <Modal.Header>
          <Modal.Title>New article</Modal.Title>
          <Modal.Description>It starts as a draft. You can change everything later.</Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-article-title">Title</Label>
            <Input
              id="new-article-title"
              value={title}
              maxLength={LIMITS.articleTitle}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-article-type">Type</Label>
            <select
              id="new-article-type"
              className={`${selectClass} w-full`}
              value={type}
              onChange={(e) => setType(e.target.value as ArticleType)}
            >
              {ARTICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ARTICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <FormError message={error} testId="create-article-error" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!title.trim()}>
            Create article
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
