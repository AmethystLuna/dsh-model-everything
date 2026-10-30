/**
 * What an annotation message looks like after it has been sent.
 *
 * The message is one block of plain lines: a fixed opening, numbered items, a question line, then the reader's
 * own words. That is the right thing for the model and the wrong thing to read as a human - the reader wrote one
 * note about one node, and what landed is a page of protocol.
 *
 * The host renders a user message as one text node, not as markdown, so there is nothing to address by tag: the
 * decorator finds the deepest element whose text carries the block's opening line, cuts the block out of that
 * text, and leaves the reader's question plus a count. Hovering the count opens a card that lists the notes - the
 * shape the shipped annotation plugin uses, and the only hook a bundle has on a message it did not render.
 *
 * Everything here is defensive: a page without the elements, an element without text, an element already handled.
 * A decorator that throws would take a render pass with it.
 */

/** The first words of every annotation block, used to recognise one in the transcript. */
export const TRANSCRIPT_MARKER = 'Diagram annotations -'

/** Where the block hands over to the reader's own question. */
const QUESTION = 'Question:'

/** Marks an element the decorator has handled, and remembers the block it came from. */
const HANDLED = 'data-dme-annotated'
const ORIGINAL = 'data-dme-annotation-text'

/** Elements whose text can be the message. Nested containers are excluded by the descendant test below. */
const SELECTOR = 'div, p, span, li'

const BORDER = '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.35))'

export interface TranscriptNode {
  textContent?: string | null
  style?: Record<string, string | undefined>
  setAttribute?: (name: string, value: string) => void
  getAttribute?: (name: string) => string | null
  addEventListener?: (type: string, handler: () => void) => void
  querySelector?: (selector: string) => TranscriptNode | null
  querySelectorAll?: (selector: string) => ArrayLike<TranscriptNode>
  getBoundingClientRect?: () => { left: number; top: number; width: number; height: number }
  appendChild?: (node: TranscriptNode) => unknown
  parentNode?: { insertBefore?: (node: TranscriptNode, before: TranscriptNode) => unknown } | null
}

export interface TranscriptDocument {
  querySelectorAll?: (selector: string) => ArrayLike<TranscriptNode>
  createElement?: (tag: string) => TranscriptNode
}

/** One note as the block states it. */
export interface AnnotationItem {
  index: number
  node: string
  note: string
}

/** The count in the opening line, for the chip; null when the line says something unexpected. */
export function annotationCountOf(text: string): number | null {
  const found = /Diagram annotations - (\d+)/.exec(text)
  return found === null ? null : Number(found[1])
}

/** The reader's own words: what follows the question line, or nothing when the note was the whole message. */
export function questionOf(text: string): string {
  const at = text.lastIndexOf(QUESTION)
  return at === -1 ? '' : text.slice(at + QUESTION.length).trim()
}

/**
 * The notes the block carries, read back out of its lines.
 *
 * The card shows the same items the model received, not a summary of them: a reader who wants to check what was
 * sent should see exactly what was sent.
 */
export function itemsOf(text: string): AnnotationItem[] {
  const items: AnnotationItem[] = []
  const lines = text.split(String.fromCharCode(10))
  for (const raw of lines) {
    const line = raw.trim()
    const head = /^(\d+)\. node (.+)$/.exec(line)
    if (head !== null) {
      items.push({ index: Number(head[1]), node: head[2], note: '' })
      continue
    }
    const note = /^Note: (.*)$/.exec(line)
    if (note !== null && items.length > 0) items[items.length - 1].note = note[1]
  }
  return items
}

function holdsAnotherBlock(node: TranscriptNode): boolean {
  const inner = node.querySelectorAll?.(SELECTOR)
  if (inner === undefined || inner === null) return false
  for (let index = 0; index < inner.length; index += 1) {
    const text = inner[index].textContent
    if (typeof text === 'string' && text.indexOf(TRANSCRIPT_MARKER) !== -1) return true
  }
  return false
}

/** A card listing the notes, styled from the host's tokens so it reads as part of the page. */
function cardFor(doc: TranscriptDocument, items: AnnotationItem[], title: string, full: string, ref: TranscriptDocument): TranscriptNode | undefined {
  const card = doc.createElement?.('div')
  if (card === undefined) return undefined
  card.style = {
    position: 'fixed', zIndex: '40', display: 'none', maxWidth: '360px', padding: '8px 10px', borderRadius: '10px',
    background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, Canvas))',
    border: BORDER, boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
    color: 'var(--dsw-alias-label-primary, CanvasText)', font: '12px system-ui, sans-serif',
  }
  const head = doc.createElement?.('div')
  if (head !== undefined) {
    head.textContent = title
    head.style = {
      color: 'var(--dsw-alias-label-secondary, GrayText)', paddingBottom: '6px', marginBottom: '4px',
      borderBottom: BORDER, fontSize: '11px',
    }
    card.appendChild?.(head)
  }
  for (const item of items) {
    const row = doc.createElement?.('div')
    if (row === undefined) continue
    row.style = { display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '3px 0' }
    const badge = doc.createElement?.('span')
    if (badge !== undefined) {
      badge.textContent = String(item.index)
      badge.style = {
        flex: '0 0 auto', width: '16px', height: '16px', lineHeight: '16px', textAlign: 'center',
        borderRadius: '8px', fontSize: '10px',
        background: 'var(--dsw-alias-brand-primary, #2563eb)', color: '#fff',
      }
      row.appendChild?.(badge)
    }
    const body = doc.createElement?.('div')
    if (body !== undefined) {
      body.textContent = item.node + (item.note === '' ? '' : String.fromCharCode(10) + item.note)
      body.style = { flex: '1 1 auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
      row.appendChild?.(body)
    }
    card.appendChild?.(row)
  }
  // The block itself is one click away, for a reader checking what exactly was sent.
  const more = doc.createElement?.('div')
  if (more !== undefined) {
    more.textContent = full
    more.style = {
      display: 'none', marginTop: '6px', paddingTop: '6px', borderTop: BORDER, fontSize: '11px',
      whiteSpace: 'pre-wrap', color: 'var(--dsw-alias-label-secondary, GrayText)', maxHeight: '40vh', overflow: 'auto',
    }
    card.appendChild?.(more)
  }
  void ref
  return card
}

function chipFor(doc: TranscriptDocument, label: string, title: string, text: string): TranscriptNode | undefined {
  const chip = doc.createElement?.('div')
  if (chip === undefined) return undefined
  chip.textContent = label
  chip.setAttribute?.('role', 'button')
  // A pill that sits in the reader's line, not a block that pushes it: the conversation is theirs, and the chip
  // is a footnote to it.
  chip.style = {
    display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', margin: '4px 0 0',
    fontSize: '11px', lineHeight: '20px', borderRadius: '10px', verticalAlign: 'middle', userSelect: 'none',
    border: BORDER, background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
    color: 'var(--dsw-alias-label-secondary, GrayText)', cursor: 'pointer', maxWidth: '100%',
  }
  const items = itemsOf(text)
  const card = cardFor(doc, items, title, text, doc)
  if (card === undefined) return chip
  const place = (): void => {
    const box = chip.getBoundingClientRect?.()
    const cardStyle = card.style ?? {}
    cardStyle.display = 'block'
    if (box === undefined) return
    cardStyle.left = String(Math.max(8, box.left)) + 'px'
    cardStyle.top = String(box.top + box.height + 6) + 'px'
    card.style = cardStyle
  }
  const hide = (): void => {
    const cardStyle = card.style ?? {}
    cardStyle.display = 'none'
    card.style = cardStyle
  }
  chip.addEventListener?.('mouseenter', place)
  chip.addEventListener?.('mouseleave', hide)
  chip.addEventListener?.('click', () => {
    const shown = (card.style ?? {}).display === 'block'
    if (shown) { hide() } else { place() }
  })
  // The chip carries its card with it, so a bubble that re-renders cannot leave a card behind.
  chip.appendChild?.(card)
  return chip
}

/**
 * Fold every annotation message in the transcript behind its count, and answer how many were folded.
 *
 * Idempotent: an element that already carries the marker is skipped, so the observer can call this on every
 * change without stacking chips. Only the element whose text is the message is touched, never a container.
 */
export function decorateTranscript(doc: TranscriptDocument | undefined, label = 'Notes', title = 'Notes in this message'): number {
  if (doc === undefined || typeof doc.querySelectorAll !== 'function') return 0
  let nodes: ArrayLike<TranscriptNode>
  try {
    nodes = doc.querySelectorAll(SELECTOR)
  } catch {
    return 0
  }
  let folded = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const text = typeof node.textContent === 'string' ? node.textContent : ''
    if (!text.includes(TRANSCRIPT_MARKER)) continue
    if (node.getAttribute?.(HANDLED) === '1') continue
    // A container holds the marker too, and rewriting its text would take the rest of the message with it. What
    // makes it a container is not that it has children - every bubble has them - but that a descendant is a block.
    if (holdsAnotherBlock(node)) continue
    const count = annotationCountOf(text)
    const chip = chipFor(doc, label + (count === null ? '' : ' ×' + String(count)), title, text)
    if (chip === undefined) continue
    try {
      node.setAttribute?.(ORIGINAL, text)
      node.setAttribute?.(HANDLED, '1')
      node.textContent = questionOf(text)
      node.appendChild?.(chip)
      folded += 1
    } catch {
      // A page that refuses the write keeps the plain message, which reads on its own.
    }
  }
  return folded
}

/**
 * Fold now, and again whenever the conversation changes.
 *
 * A sent message is rendered by the host, not by this plugin, so watching is the only way to act on it. The
 * observer is coalesced by the browser and the work is idempotent, so a busy transcript costs a scan per change.
 */
export function startTranscriptDecoration(doc: TranscriptDocument | undefined, label = 'Notes', title = 'Notes in this message'): () => void {
  decorateTranscript(doc, label, title)
  const Observer = (globalThis as { MutationObserver?: new (callback: () => void) => { observe: (target: unknown, options: unknown) => void; disconnect: () => void } }).MutationObserver
  if (doc === undefined || Observer === undefined) return () => {}
  let watcher: { disconnect: () => void } | undefined
  try {
    const observer = new Observer(() => { decorateTranscript(doc, label, title) })
    observer.observe(doc, { childList: true, subtree: true })
    watcher = observer
  } catch {
    return () => {}
  }
  return () => { watcher?.disconnect() }
}
