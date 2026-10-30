/**
 * What an annotation message looks like after it has been sent.
 *
 * The message is one block of plain lines: a fixed opening, numbered items, a question line, then the reader's
 * own words. That is the right thing for the model and the wrong thing to read as a human - the reader wrote one
 * note about one node, and what landed is a page of protocol.
 *
 * The host renders a user message as one text node, not as markdown, so there is nothing to address by tag: the
 * decorator finds the element whose text starts with the block's opening line, cuts the block out of that text and
 * leaves the reader's question with a chip that can put the block back. This is the same trade the shipped
 * annotation plugin makes, and it is the only hook a bundle has on a message it did not render.
 *
 * Everything here is defensive: a page without the elements, an element without text, an element already handled.
 * A decorator that throws would take a render pass with it.
 */

/** The first words of every annotation block, used to recognise one in the transcript. */
export const TRANSCRIPT_MARKER = 'Diagram annotations -'

/** Where the block hands over to the reader's own question. */
const QUESTION = 'Question:'

/** Marks an element the decorator has handled, and remembers what it looked like. */
const HANDLED = 'data-dme-annotated'
const ORIGINAL = 'data-dme-annotation-text'
const COLLAPSED = 'data-dme-annotation-collapsed'

/** Elements whose text can be the message. Nested containers are excluded by requiring the deepest match. */
const SELECTOR = 'div, p, span, li'

export interface TranscriptNode {
  textContent?: string | null
  style?: Record<string, string | undefined>
  setAttribute?: (name: string, value: string) => void
  getAttribute?: (name: string) => string | null
  removeAttribute?: (name: string) => void
  addEventListener?: (type: string, handler: () => void) => void
  querySelector?: (selector: string) => TranscriptNode | null
  appendChild?: (node: TranscriptNode) => unknown
  parentNode?: { insertBefore?: (node: TranscriptNode, before: TranscriptNode) => unknown } | null
}

export interface TranscriptDocument {
  querySelectorAll?: (selector: string) => ArrayLike<TranscriptNode>
  createElement?: (tag: string) => TranscriptNode
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

function chipFor(doc: TranscriptDocument, node: TranscriptNode, label: string, foldLabel: string): TranscriptNode | undefined {
  const chip = doc.createElement?.('div')
  if (chip === undefined) return undefined
  chip.textContent = label
  chip.setAttribute?.('role', 'button')
  // A pill that sits in the reader's line, not a block that pushes it: the conversation is theirs, and the chip
  // is a footnote to it.
  chip.style = {
    display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', margin: '4px 0 0',
    fontSize: '11px', lineHeight: '20px', borderRadius: '10px', verticalAlign: 'middle', userSelect: 'none',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.35))',
    background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
    color: 'var(--dsw-alias-label-secondary, GrayText)', cursor: 'pointer', maxWidth: '100%',
  }
  chip.addEventListener?.('click', () => {
    const open = node.getAttribute?.(COLLAPSED) === '0'
    const full = node.getAttribute?.(ORIGINAL) ?? ''
    if (open) {
      // Fold again: the question stays, the chip stays, the protocol goes.
      node.textContent = questionOf(full)
      node.setAttribute?.(COLLAPSED, '1')
      chip.textContent = label
      if (node.appendChild !== undefined) node.appendChild(chip)
    } else {
      node.textContent = full
      node.setAttribute?.(COLLAPSED, '0')
      chip.textContent = label + ' · ' + foldLabel
      if (node.appendChild !== undefined) node.appendChild(chip)
    }
  })
  return chip
}

/**
 * Fold every annotation message in the transcript behind its count, and answer how many were folded.
 *
 * Idempotent: an element that already carries the marker is skipped, so the observer can call this on every
 * change without stacking chips. Only the deepest element carrying the marker is touched, because a container
 * would take the rest of the conversation with it.
 */
export function decorateTranscript(doc: TranscriptDocument | undefined, label = 'Notes', foldLabel = 'hide'): number {
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
    // A container also contains the marker; the deepest element is the one holding the message's own text.
    let deeper = false
    try {
      deeper = node.querySelector?.(SELECTOR) !== null && node.querySelector?.(SELECTOR) !== undefined
    } catch {
      deeper = false
    }
    if (deeper) continue
    const count = annotationCountOf(text)
    const question = questionOf(text)
    const chip = chipFor(doc, node, label + (count === null ? '' : ' ×' + String(count)), foldLabel)
    if (chip === undefined) continue
    try {
      node.setAttribute?.(ORIGINAL, text)
      node.setAttribute?.(COLLAPSED, '1')
      node.setAttribute?.(HANDLED, '1')
      node.textContent = question
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
export function startTranscriptDecoration(doc: TranscriptDocument | undefined, label = 'Notes', foldLabel = 'hide'): () => void {
  decorateTranscript(doc, label, foldLabel)
  const Observer = (globalThis as { MutationObserver?: new (callback: () => void) => { observe: (target: unknown, options: unknown) => void; disconnect: () => void } }).MutationObserver
  if (doc === undefined || Observer === undefined) return () => {}
  let watcher: { disconnect: () => void } | undefined
  try {
    const observer = new Observer(() => { decorateTranscript(doc, label, foldLabel) })
    observer.observe(doc, { childList: true, subtree: true })
    watcher = observer
  } catch {
    return () => {}
  }
  return () => { watcher?.disconnect() }
}
