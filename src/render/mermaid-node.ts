/**
 * What one Mermaid node token states: its id, its label and the shape it asked for.
 *
 * The delimiters nest - `a([Text])` is a stadium around `Text`, `a((Text))` a circle, `a[/Text/]` a parallelogram - and a matcher that tries
 * them in the wrong order reads the outer pair and leaves the inner one in the label, which is how `[Stadium]` and `(Circle)` became names.
 * The order below is longest delimiter first, and that order is the whole of the rule.
 */
import type { DiagramNode } from './model.js'

type Shape = DiagramNode['shape']

/** The delimiters, longest first. Each entry is the pattern for one shape and what it draws as. */
const SHAPES: [RegExp, Shape][] = [
  [/^\[\((.+)\)\]$/, 'cylinder'],
  [/^\[\[(.+)\]\]$/, 'subroutine'],
  [/^\(\((.+)\)\)$/, 'circle'],
  [/^\{\{(.+)\}\}$/, 'hexagon'],
  [/^\[\/(.+)\/\]$/, 'rect'],
  [/^\[\\(.+)\\\]$/, 'rect'],
  [/^\[([^\]]+)\]$/, 'rect'],
  [/^\(\[(.+)\]\)$/, 'stadium'],
  [/^\((.+)\)$/, 'stadium'],
  [/^\{(.+)\}$/, 'diamond'],
  [/^>(.+)\]$/, 'rect'],
  [/^<<(.+)>>$/, 'hexagon'],
]

const ID = /^([A-Za-z_][\w-]*)\s*(.*)$/

/**
 * The node a token states, or `undefined` when the token is not a node.
 *
 * A token with no delimiters is an id alone, which is how an edge names an element it does not declare. A quoted label loses its quotes.
 */
export function readNode(token: string): { id: string; label?: string; shape?: Shape } | undefined {
  const trimmed = token.trim()
  const named = ID.exec(trimmed)
  if (named === null) return undefined
  const id = named[1] as string
  const rest = (named[2] as string).trim()
  if (rest === '') return { id }
  for (const [pattern, shape] of SHAPES) {
    const matched = pattern.exec(rest)
    if (matched === null) continue
    const label = (matched[1] as string).trim().replace(/^["']|["']$/g, '')
    return { id, label, shape }
  }
  return undefined
}
