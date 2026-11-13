/**
 * What an arrow does to the drawing: which element it enters, and whether it is drawn as an edge or as the machine's exit.
 *
 * `readArrow` says what the line states; this says what that means. The one decision worth its own test is the exit marker: `X --> [*]`
 * leaves the machine, and read as a plain endpoint it would draw a box called `*`.
 */
import type { ArrowParts } from './plantuml-reference.js'
import type { Reference } from './plantuml-reference.js'

export interface ArrowEffect {
  from: Reference
  to: Reference
  label: string
  dashed?: boolean
  /** Absent for the exit marker, which is drawn as the same self-loop the Mermaid adapter draws. */
  arrow?: string
  /** True when the arrow leaves the machine: the edge closes on its own source. */
  exit: boolean
}

/**
 * The effect of an arrow whose ends were both read.
 *
 * An exit marker keeps its label when the source wrote one, and is labelled `end` when it did not: a self-loop with no label reads as a
 * mistake rather than as leaving.
 */
export function planArrow(arrow: ArrowParts): ArrowEffect {
  if (arrow.to.id === '*') {
    return {
      from: arrow.from,
      to: arrow.from,
      label: arrow.label === '' ? 'end' : arrow.label,
      // Leaving is drawn dashed, which is the same statement the Mermaid adapter makes for its end marker.
      dashed: true,
      exit: true,
    }
  }
  return {
    from: arrow.from,
    to: arrow.to,
    label: arrow.label,
    ...(arrow.dashed ? { dashed: true } : {}),
    arrow: arrow.arrow,
    exit: false,
  }
}
