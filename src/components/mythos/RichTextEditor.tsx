/**
 * The article body: Tiptap bound to the article's record-bound Yjs document.
 *
 * - Live: every keystroke syncs to everyone viewing the article.
 * - The RecordRoom applies an update only when the sender passes the
 *   article's `update` rule and reports that as `canWrite`, so read-only
 *   state is the server's decision, not this component's.
 * - The ProseMirror fragment is named `body`, the same name as the field:
 *   that is what lets the server's text tool erase it before an article is
 *   deleted (ADR-018). Do not rename it.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type AnyExtension, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Unlink,
} from 'lucide-react'
import { getUserColor, useAuth, useYjsField } from 'deepspace'
import { COLLECTIONS } from '@/domain/mythos'
import type { RichTextNode } from '@/domain/records'
import { useUserNames } from '@/features/universes/hooks'
import { cn } from '@/lib/utils'
import { Skeleton } from './Skeleton'

/** The Yjs field and ProseMirror fragment name for article bodies (see header). */
export const ARTICLE_BODY_FIELD = 'body'

const SAFE_LINK = /^(https?:\/\/|mailto:)/i

function renderCaret(user: { name?: string | null; color?: string | null }): HTMLElement {
  const color = user.color || '#c9a35b'
  const caret = document.createElement('span')
  caret.classList.add('collaboration-carets__caret')
  caret.style.setProperty('--collaboration-caret-color', color)
  caret.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.classList.add('collaboration-carets__label')
  label.style.backgroundColor = color
  label.style.color = '#17120a'
  label.textContent = user.name || 'Collaborator'
  caret.appendChild(label)
  return caret
}

export interface ArticleBody {
  editor: Editor | null
  synced: boolean
  canWrite: boolean
  /** The current body as rich-text JSON (for saving a version). */
  getJSON: () => RichTextNode | null
}

/** Connects to an article's live body. `editable` adds a local opt-in on top of the server's canWrite. */
export function useArticleBody(articleId: string, { editable, placeholder }: { editable: boolean; placeholder?: string }): ArticleBody {
  const { doc, awareness, synced, canWrite } = useYjsField(COLLECTIONS.articles, articleId, ARTICLE_BODY_FIELD)
  const { userId } = useAuth()
  const names = useUserNames()
  const userName = (userId && names.get(userId)) || 'You'
  const userColor = userId ? getUserColor(userId) : '#c9a35b'
  const fragment = useMemo(() => doc.getXmlFragment(ARTICLE_BODY_FIELD), [doc])
  const provider = useMemo(() => (awareness ? { awareness } : null), [awareness])

  const extensions = useMemo(() => {
    const exts: AnyExtension[] = [
      // Yjs keeps its own undo history; ProseMirror's would corrupt shared state.
      StarterKit.configure({
        undoRedo: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Collaboration.configure({ fragment }),
      Typography,
      Placeholder.configure({ placeholder: placeholder ?? 'Begin the chronicle…' }),
    ]
    if (provider && editable) {
      exts.push(CollaborationCaret.configure({ provider, user: { name: userName, color: userColor }, render: renderCaret }))
    }
    return exts
  }, [fragment, provider, editable, userName, userColor, placeholder])

  const editor = useEditor(
    {
      editable: false,
      immediatelyRender: false,
      extensions,
      editorProps: {
        attributes: {
          class: 'mythos-prose min-h-[12rem]',
          'data-testid': 'article-body-editor',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': 'Article body',
        },
      },
    },
    [extensions],
  )

  const shouldEdit = editable && synced && canWrite
  const prev = useRef<boolean | null>(null)
  useEffect(() => {
    if (editor && prev.current !== shouldEdit) {
      prev.current = shouldEdit
      editor.setEditable(shouldEdit)
      editor.view.dom.setAttribute('aria-readonly', String(!shouldEdit))
    }
  }, [editor, shouldEdit])

  return {
    editor,
    synced,
    canWrite,
    getJSON: () => (editor ? (editor.getJSON() as RichTextNode) : null),
  }
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-primary/15 text-primary',
      )}
    >
      {children}
    </button>
  )
}

export function EditorToolbar({ editor, className }: { editor: Editor; className?: string }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      editable: e.isEditable,
    }),
  })
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const off = !state.editable
  const chain = () => editor.chain().focus()

  function applyLink(e: FormEvent) {
    e.preventDefault()
    const value = href.trim()
    if (!SAFE_LINK.test(value)) {
      setLinkError('Links must start with http://, https:// or mailto:')
      return
    }
    chain().extendMarkRange('link').setLink({ href: value }).run()
    setLinking(false)
    setHref('')
    setLinkError(null)
  }

  return (
    <div className={cn('z-10 border-b border-border bg-card/95 backdrop-blur', className)}>
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <ToolButton label="Bold" active={state.bold} disabled={off} onClick={() => chain().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolButton>
        <ToolButton label="Italic" active={state.italic} disabled={off} onClick={() => chain().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolButton>
        <ToolButton label="Strikethrough" active={state.strike} disabled={off} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label="Heading" active={state.h2} disabled={off} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="size-4" />
        </ToolButton>
        <ToolButton label="Subheading" active={state.h3} disabled={off} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="size-4" />
        </ToolButton>
        <ToolButton label="Bulleted list" active={state.bullet} disabled={off} onClick={() => chain().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolButton>
        <ToolButton label="Numbered list" active={state.ordered} disabled={off} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolButton>
        <ToolButton label="Quotation" active={state.quote} disabled={off} onClick={() => chain().toggleBlockquote().run()}>
          <Quote className="size-4" />
        </ToolButton>
        <ToolButton label="Divider" disabled={off} onClick={() => chain().setHorizontalRule().run()}>
          <Minus className="size-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {state.link ? (
          <ToolButton label="Remove link" disabled={off} onClick={() => chain().extendMarkRange('link').unsetLink().run()}>
            <Unlink className="size-4" />
          </ToolButton>
        ) : (
          <ToolButton label="Add link" active={linking} disabled={off} onClick={() => setLinking((v) => !v)}>
            <Link2 className="size-4" />
          </ToolButton>
        )}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label="Undo" disabled={off} onClick={() => chain().undo().run()}>
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton label="Redo" disabled={off} onClick={() => chain().redo().run()}>
          <Redo2 className="size-4" />
        </ToolButton>
      </div>
      {linking && (
        <form onSubmit={applyLink} className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          <label htmlFor="link-href" className="text-xs text-muted-foreground">
            Link address
          </label>
          <input
            id="link-href"
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://…"
            className="h-8 min-w-48 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          />
          <button type="submit" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
            Apply
          </button>
          <button type="button" onClick={() => setLinking(false)} className="h-8 px-2 text-xs text-muted-foreground">
            Cancel
          </button>
          {linkError && (
            <p role="alert" className="w-full text-xs text-destructive">
              {linkError}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

/**
 * Editing surface: toolbar + body, with connection state. `toolbarClassName`
 * positions the toolbar (e.g. sticky below the page's own sticky bar).
 */
export function RichTextEditor({ body, toolbarClassName }: { body: ArticleBody; toolbarClassName?: string }) {
  const { editor, synced, canWrite } = body
  return (
    <div className="rounded-xl border border-border bg-card">
      {editor && <EditorToolbar editor={editor} className={cn('rounded-t-xl', toolbarClassName)} />}
      <div className="px-5 py-4 sm:px-8 sm:py-6">
        {!synced || !editor ? (
          <div role="status" aria-live="polite" className="space-y-3">
            <span className="sr-only">Connecting to the live document…</span>
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground" data-testid="body-sync-state">
        {!synced ? 'Connecting…' : canWrite ? 'Live — everyone here sees your changes as you type' : 'Read only'}
      </p>
    </div>
  )
}

/** Read view of the live body (updates in real time, never editable). */
export function RichTextView({ articleId }: { articleId: string }) {
  const body = useArticleBody(articleId, { editable: false })
  const isEmpty = useEditorState({
    editor: body.editor,
    selector: ({ editor: e }) => (e ? e.isEmpty : true),
  })
  if (!body.synced || !body.editor) {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        <span className="sr-only">Loading the article…</span>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    )
  }
  return (
    <div data-testid="article-body-view">
      {isEmpty && <p className="font-serif italic text-muted-foreground">Nothing has been written here yet.</p>}
      <div className={cn('mythos-dropcap', isEmpty && 'hidden')}>
        <EditorContent editor={body.editor} />
      </div>
    </div>
  )
}
