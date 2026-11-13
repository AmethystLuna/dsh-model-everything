/**
 * The lines that place a note: `note right of X : text`, and the two forms this renderer refuses with a reason.
 *
 * A note beside a box is a note *and* a position. The position is honoured through the same machinery every other placement uses - a
 * hidden edge with a direction hint - so the note lands beside its box without a second layout rule. What the line states is decided
 * here; the parser writes it.
 */
import type { Reference } from './plantuml-reference.js'
import { reference } from './plantuml-reference.js'

export type NoteLine =
  | {
      kind: 'placed'
      /** The element the note belongs to. */
      target: Reference
      /** The element id the note is drawn as. */
      noteId: string
      text: string
      /** The direction the hidden edge carries, stated from the box's side. */
      hint: 'left' | 'right' | 'up' | 'down'
      /** The note's own keyword when the source asked for a shape other than the default fold. */
      shape?: string
    }
  | { kind: 'refused'; message: string }

/**
 * The note a line places, or `undefined` when the line places none.
 *
 * The hint is turned here rather than at the write: `-right->` puts the far box on the right, so a note on a box's left is stated as
 * `left` and the layout gets the direction the source meant.
 */
export function readNote(line: string, where: string, ordinal = 1): NoteLine | undefined {
  // `hnote` and `rnote` place a note exactly as `note` does and differ only in the shape drawn: the placement is honoured, the shape is
  const placed = /^(note|hnote|rnote)\s+(left|right|top|bottom)\s+of\s+(.+?)(?:\s*:\s*(.+))?$/.exec(line)
  if (placed !== null) {
    const target = reference(placed[3] as string)
    const text = (placed[4] ?? '').trim()
    if (text === '') {
      return {
        kind: 'refused',
        message: where + '`' + line + '` names no text: a note beside a box needs its words on the same line',
      }
    }
    const side = placed[2] as 'left' | 'right' | 'top' | 'bottom'
    return {
      kind: 'placed',
      target,
      // Two notes may sit beside one box: the ordinal is what keeps them apart. Without it the second note found the first one
      // already drawn under the same id and was dropped in silence.
      noteId: 'note-' + target.id + '-' + String(ordinal),
      text,
      shape: (placed[1] as string) === 'note' ? undefined : (placed[1] as string),
      hint: side === 'top' ? 'up' : side === 'bottom' ? 'down' : side,
    }
  }

  // A note attached to whatever box came last depends on reading order, which is not a statement the drawing can make.
  if (/^note\s+(left|right|top|bottom)\s*:/.test(line)) {
    return {
      kind: 'refused',
      message: where + '`' + line.split(':')[0] + '`: a note attached to the last box names no box; `note right of X : text` names one',
    }
  }

  // A note on a link belongs to an edge this drawing cannot name from the line.
  if (/^note\s+on\s+link\b/.test(line)) {
    return {
      kind: 'refused',
      message: where + '`' + line.split(':')[0] + '`: a note on a link names the link, and no line here can name one',
    }
  }

  // A note over a box is a position no edge can express, so it is refused by name rather than dropped.
  if (/^note\s+over\b/.test(line)) {
    return {
      kind: 'refused',
      message: where + '`' + line.split(/\s+/).slice(0, 3).join(' ') + '`: a note over a box is a position this renderer cannot draw',
    }
  }

  return undefined
}
