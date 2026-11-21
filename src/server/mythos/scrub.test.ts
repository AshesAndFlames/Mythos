/**
 * The erase-on-delete design relies on one Yjs property: with garbage
 * collection on (the default, and how the RecordRoom creates its docs), text
 * that has been deleted is not kept in the encoded state the room persists.
 * These tests pin that property for the installed yjs version, using the same
 * calls the RecordRoom makes (`new Y.Doc()`, `applyUpdate` from storage,
 * `encodeStateAsUpdate` on save).
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

const SECRET = 'The heir is hidden in Silverhold'
const contains = (bytes: Uint8Array, text: string) =>
  Buffer.from(bytes).includes(Buffer.from(text, 'utf8'))

/** What `yjs.setText(..., '')` does inside the room. */
function eraseText(doc: Y.Doc, field: string) {
  const text = doc.getText(field)
  doc.transact(() => text.delete(0, text.length))
}

describe('erasing a Yjs body removes its content from stored state', () => {
  it('stored state contains the text before erasing, and not after', () => {
    const doc = new Y.Doc()
    doc.getText('body').insert(0, SECRET)
    expect(contains(Y.encodeStateAsUpdate(doc), SECRET)).toBe(true)

    eraseText(doc, 'body')
    const stored = Y.encodeStateAsUpdate(doc)
    expect(contains(stored, SECRET)).toBe(false)
    expect(contains(stored, 'Silverhold')).toBe(false)
  })

  it('also holds for a document reloaded from storage, edited by several clients', () => {
    // Two "browsers" type, the room merges and persists.
    const a = new Y.Doc()
    const b = new Y.Doc()
    a.getText('body').insert(0, 'The heir is ')
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    b.getText('body').insert(12, 'hidden in Silverhold')
    const room = new Y.Doc()
    Y.applyUpdate(room, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(room, Y.encodeStateAsUpdate(b))
    const persisted = Y.encodeStateAsUpdate(room)
    expect(contains(persisted, 'Silverhold')).toBe(true)

    // Later the room reloads the doc from storage and erases it.
    const reloaded = new Y.Doc()
    Y.applyUpdate(reloaded, persisted)
    eraseText(reloaded, 'body')
    const after = Y.encodeStateAsUpdate(reloaded)
    expect(contains(after, 'heir')).toBe(false)
    expect(contains(after, 'Silverhold')).toBe(false)
    expect(reloaded.getText('body').toString()).toBe('')
  })

  it('an old client re-sending its state cannot revive erased text', () => {
    const room = new Y.Doc()
    const client = new Y.Doc()
    client.getText('body').insert(0, SECRET)
    Y.applyUpdate(room, Y.encodeStateAsUpdate(client))
    eraseText(room, 'body')
    // The client re-syncs its stale state (as on reconnect).
    Y.applyUpdate(room, Y.encodeStateAsUpdate(client))
    expect(room.getText('body').toString()).toBe('')
    expect(contains(Y.encodeStateAsUpdate(room), SECRET)).toBe(false)
  })
})

/**
 * The rich-text body (Tiptap) is a Y.XmlFragment named `body`. The room never
 * instantiates that root type itself, so when the erase tool calls
 * `doc.getText('body')` on a doc loaded from storage, Yjs adopts the existing
 * root as a Y.Text over the same items. Deleting its whole length deletes
 * every top-level element, and deleting an element deletes its children.
 */
describe('erasing a rich-text (XmlFragment) body through the text tool', () => {
  function richClient(paragraphs: string[]): Y.Doc {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('body')
    fragment.insert(
      0,
      paragraphs.map((text) => {
        const p = new Y.XmlElement('paragraph')
        p.insert(0, [new Y.XmlText(text)])
        return p
      }),
    )
    return doc
  }

  it('removes nested content from the stored state and empties every client', () => {
    const client = richClient(['The heir is hidden', 'in Silverhold'])
    const stored = Y.encodeStateAsUpdate(client)
    expect(contains(stored, 'Silverhold')).toBe(true)

    // The room loads the stored doc and runs yjs.setText('body', '').
    const room = new Y.Doc()
    Y.applyUpdate(room, stored)
    const text = room.getText('body')
    let update: Uint8Array | null = null
    room.on('update', (u: Uint8Array) => {
      update = u
    })
    room.transact(() => text.delete(0, text.length))

    const after = Y.encodeStateAsUpdate(room)
    expect(contains(after, 'heir')).toBe(false)
    expect(contains(after, 'Silverhold')).toBe(false)

    // The broadcast update empties a connected editor's fragment too.
    expect(update).not.toBeNull()
    Y.applyUpdate(client, update as unknown as Uint8Array)
    expect(client.getXmlFragment('body').length).toBe(0)
    expect(client.getXmlFragment('body').toString()).toBe('')
  })
})
