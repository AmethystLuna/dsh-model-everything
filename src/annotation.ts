/**
 * An annotation: the reader points at a node in a drawing and says something about it.
 *
 * The note has to reach the session as an ordinary message, because the session log is the only record a
 * replay, a fork or a resumed agent can rebuild from. Two transports can carry it, and they consume the
 * same text: a host command that turns the note into a follow-up (planned; the interface is
 * `annotationMessage`), and the composer, which hands the text to the reader's own input box (works today).
 *
 * Splitting the text from the transport is what keeps the two interchangeable, and what lets this module be
 * tested without a browser.
 */

/** What the reader said, and where. */
export interface Annotation {
  /** The node's id, as it appears in the markup the renderer wrote. */
  nodeId: string
  /** The node's label, when it differs from the id: a reader points at words, not at identifiers. */
  label?: string
  /** The note itself. Empty is meaningful: the reader marked the node and said nothing. */
  note?: string
  /** Which drawing, when the reader is looking at more than one. A single source line is enough. */
  caption?: string
}

/**
 * The text that travels to the session: what was marked, and what was said, and nothing invented.
 *
 * A blank note is not dropped - it says the node was marked - because "the reader pointed here" and "the
 * reader pointed here and said this" are different messages, and only one of them survives a silent trim.
 */
export function annotationMessage(annotation: Annotation): string {
  const label = (annotation.label ?? '').trim()
  const node = label === '' || label === annotation.nodeId ? annotation.nodeId : label + ' (' + annotation.nodeId + ')'
  const lines = ['Diagram annotation · node "' + node + '"']
  const caption = (annotation.caption ?? '').trim()
  if (caption !== '') lines.push(caption)
  const note = (annotation.note ?? '').trim()
  lines.push(note === '' ? 'no note — the reader marked this node' : note)
  return lines.join('\n')
}

/** The parts of the page this module touches, so the client bundle needs no DOM lib and a test can fake them. */
export interface ElementLike {
  value?: unknown
  querySelector?: (selector: string) => unknown
  textContent?: unknown
  focus?: () => void
  dispatchEvent?: (event: unknown) => boolean
  getAttribute?: (name: string) => string | null
  tagName?: unknown
}

export interface DocumentLike {
  querySelector: (selector: string) => unknown
  querySelectorAll?: (selector: string) => ArrayLike<unknown>
}

/**
 * Where the reader's next message is typed.
 *
 * The host marks its composer with `data-focus-flow`; the board's own source box does not carry it, which is
 * what keeps an annotation from being typed into the diagram it describes.
 */
/** The marks a page may put on the box a reader types into, most specific first. */
const COMPOSER_MARKS = [
  '[data-focus-flow] textarea',
  'textarea[data-focus-flow]',
  '[data-focus-flow] [contenteditable="true"]',
  '[data-focus-flow][contenteditable="true"]',
  // No marker on this host - measured, not assumed. Everything this plugin writes carries
  // `data-dme-own`, so what remains is somebody else's writing surface.
  'textarea:not([data-dme-own])',
  '[contenteditable="true"]:not([data-dme-own])',
]

export function findComposer(doc: DocumentLike | undefined): ElementLike | undefined {
  if (doc === undefined) return undefined
  try {
    for (const mark of COMPOSER_MARKS) {
      const found = doc.querySelector(mark)
      if (found !== null && typeof found === 'object') return found as ElementLike
    }
    // The mark may sit on the composer's wrapper rather than on the writing surface itself.
    const marked = doc.querySelector('[data-focus-flow]')
    if (marked !== null && typeof marked === 'object') {
      const inner = (marked as ElementLike).querySelector?.('textarea, [contenteditable="true"]')
      if (inner !== null && inner !== undefined && typeof inner === 'object') return inner as ElementLike
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * What the page has, for a status line: a probe with no console needs one place to report from.
 *
 * Counts only. A reader's draft is never read into the report.
 */
export function pageCensus(doc: DocumentLike | undefined): string {
  if (doc === undefined) return 'no document'
  try {
    const textareas = doc.querySelectorAll === undefined ? -1 : doc.querySelectorAll('textarea').length
    const editables = doc.querySelectorAll === undefined ? -1 : doc.querySelectorAll('[contenteditable="true"]').length
    const focus = doc.querySelector('[data-focus-flow]') !== null ? 'yes' : 'no'
    return 'textarea=' + String(textareas) + ' editable=' + String(editables) + ' focus-flow=' + focus
  } catch {
    return 'census failed'
  }
}

/** What a write did, so the caller can say something true instead of something hopeful. */
export type Placed = 'filled' | 'no-composer'

/** The event constructor, or undefined where the page has none (a test, or a document that is not a browser). */
function eventOf(type: string, init: Record<string, unknown>): unknown {
  const scope = globalThis as { Event?: new (name: string, options?: unknown) => unknown }
  if (scope.Event === undefined) return undefined
  try {
    return new scope.Event(type, init)
  } catch {
    return undefined
  }
}

/** React tracks the last value it wrote; assigning through the prototype setter is what makes it see a change. */
function setValue(element: ElementLike, next: string): void {
  const scope = globalThis as { HTMLTextAreaElement?: { prototype: object }; HTMLInputElement?: { prototype: object } }
  for (const ctor of [scope.HTMLTextAreaElement, scope.HTMLInputElement]) {
    const descriptor = ctor === undefined ? undefined : Object.getOwnPropertyDescriptor(ctor.prototype, 'value')
    if (descriptor !== undefined && typeof descriptor.set === 'function') {
      descriptor.set.call(element, next)
      return
    }
  }
  element.value = next
}

/**
 * Add the text to the composer, above whatever the reader has already typed.
 *
 * Appending rather than replacing is the only behavior that cannot lose work: a reader who was halfway
 * through a message and clicked an annotation should find both halves in the box, not the annotation alone.
 */
export function fillComposer(doc: DocumentLike | undefined, text: string): Placed {
  const composer = findComposer(doc)
  if (composer === undefined) return 'no-composer'
  const isField = typeof composer.value === 'string' || composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT'
  if (isField) {
    const current = typeof composer.value === 'string' ? composer.value : ''
    setValue(composer, current.trim() === '' ? text : current.replace(/\s*$/, '') + '\n\n' + text)
  } else {
    // A contenteditable keeps its own document: assigning `textContent` looks right until the next keystroke,
    // which restores what the editor thought was there. Insert the way a paste does, and fall back to the
    // assignment only where the page has no editing command at all.
    if (composer.focus !== undefined) composer.focus()
    const editing = globalThis as { document?: { execCommand?: (command: string, showUi: boolean, value: string) => boolean } }
    const inserted = editing.document?.execCommand?.('insertText', false, text) === true
    if (!inserted) {
      const current = typeof composer.textContent === 'string' ? composer.textContent : ''
      composer.textContent = current.trim() === '' ? text : current.replace(/\s*$/, '') + '\n\n' + text
    }
  }
  const input = eventOf('input', { bubbles: true })
  if (input !== undefined && composer.dispatchEvent !== undefined) composer.dispatchEvent(input)
  if (composer.focus !== undefined) composer.focus()
  return 'filled'
}

/** Whether the page can take a Return key for the composer at all, so a button may promise it. */
export function submitComposer(doc: DocumentLike | undefined): boolean {
  const composer = findComposer(doc)
  if (composer === undefined || composer.dispatchEvent === undefined) return false
  const scope = globalThis as { KeyboardEvent?: new (name: string, options?: unknown) => unknown }
  if (scope.KeyboardEvent === undefined) return false
  try {
    composer.dispatchEvent(new scope.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    return true
  } catch {
    return false
  }
}

/**
 * One note, two actions.
 *
 * Returns the sentence to show the reader: `sent` and `the box was not there` are different outcomes, and a
 * button that reports the wrong one is worse than no button. The text is appended above a half-written draft,
 * never in place of it.
 */
export function pushNote(document: DocumentLike | undefined, picked: { id: string } | null, note: string, caption: string, submit: boolean): string {
  if (picked === null) return ''
  if (fillComposer(document, annotationMessage({ nodeId: picked.id, note, caption })) !== 'filled') {
    return '没找到输入框：先把图贴进会话，或手动复制这段文字'
  }
  if (!submit) return '已放入输入框'
  return submitComposer(document) ? '已发送' : '已放入输入框：按一次回车发送'
}
/**
 * The session a page is showing, read from its own address.
 *
 * The client services expose no "current session", and a slot's props are not guaranteed to carry one, but the
 * page has to name the session in its URL to survive a reload - so the address is the one source that is always
 * there. Both spellings are accepted: the `session-<uuid>` id this Harness mints and a bare uuid.
 */
export function sessionFromLocation(location: { pathname?: string; search?: string; hash?: string } | undefined): string | undefined {
  if (location === undefined) return undefined
  const address = [location.pathname ?? '', location.search ?? '', location.hash ?? ''].join(' ')
  const named = /session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(address)
  if (named !== null) return named[0]
  const bare = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(address)
  if (bare !== null) return bare[0]
  const parameter = /[?&#](?:session|sessionId|id)=([A-Za-z0-9_-]+)/.exec(address)
  return parameter === null ? undefined : parameter[1]
}
