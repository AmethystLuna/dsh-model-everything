/**
 * A machine drawn as text, for the card a reader looks at.
 *
 * The model-facing result already says what the engine decided; what a reader cannot see at a glance is
 * the shape of the machine those words are about. So the card draws it - in characters, because that is
 * the only channel this contract has: an image would be an attachment, and a tool result cannot create
 * one.
 *
 * Two rules keep it honest:
 *
 * - it draws only what the model declares - no state it invents, no edge it infers;
 * - it refuses to draw a graph that will not read as text, instead of printing a 60-line tangle. For a
 *   large machine the card says how large it is and stops; the report still carries the whole machine.
 */

export interface DrawableState {
  id: string
}

export interface DrawableTransition {
  from: string
  to: string
  label?: string
}

export interface Drawable {
  states: DrawableState[]
  transitions: DrawableTransition[]
  initial?: string
}

/** The most a card draws: past this the text stops being a picture and becomes a transcript. */
export const DRAW_LIMIT = { states: 12, transitions: 24 }

const LABEL_MAX = 18

function shorten(label: string): string {
  const flat = label.replace(/\s+/g, ' ').trim()
  return flat.length <= LABEL_MAX ? flat : flat.slice(0, LABEL_MAX - 1) + '…'
}

/**
 * Breadth-first depth from the initial state, so the drawing reads top to bottom like a flow.
 *
 * States the initial state cannot reach go last: they exist in the model, and hiding them would make the
 * picture disagree with the report that names them.
 */
function depths(drawable: Drawable): Map<string, number> {
  const byFrom = new Map<string, string[]>()
  for (const transition of drawable.transitions) {
    byFrom.set(transition.from, [...(byFrom.get(transition.from) ?? []), transition.to])
  }
  const depth = new Map<string, number>()
  const start = drawable.initial ?? drawable.states[0]?.id
  if (start !== undefined && drawable.states.some((state) => state.id === start)) {
    depth.set(start, 0)
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.shift() as string
      for (const next of byFrom.get(current) ?? []) {
        if (!depth.has(next)) {
          depth.set(next, (depth.get(current) ?? 0) + 1)
          queue.push(next)
        }
      }
    }
  }
  let beyond = 0
  for (const state of drawable.states) {
    if (!depth.has(state.id)) {
      depth.set(state.id, Number.MAX_SAFE_INTEGER)
      beyond += 1
    }
  }
  return depth
}

/**
 * The drawing, one level per line block: the states at that level, then the transitions leaving it.
 *
 * A transition inside a level or to a state already drawn is listed under the level it leaves, so no edge
 * is silent. That is the difference between a picture and a decoration: every declared edge appears.
 */
export function drawStateDiagram(drawable: Drawable): string[] {
  if (drawable.states.length === 0) return []
  if (drawable.states.length > DRAW_LIMIT.states || drawable.transitions.length > DRAW_LIMIT.transitions) {
    return ['(' + String(drawable.states.length) + ' states, ' + String(drawable.transitions.length) + ' transitions - too large to draw here; the report names every one)']
  }
  const depth = depths(drawable)
  const initial = drawable.initial ?? drawable.states[0]?.id
  const levels = new Map<number, string[]>()
  for (const state of drawable.states) {
    const level = depth.get(state.id) ?? Number.MAX_SAFE_INTEGER
    levels.set(level, [...(levels.get(level) ?? []), state.id])
  }
  const ordered = [...levels.keys()].sort((a, b) => a - b)
  const lines: string[] = []
  for (const level of ordered) {
    const states = levels.get(level) ?? []
    const boxed = states.map((id) => (id === initial ? '((' + id + '))' : '[' + id + ']'))
    lines.push(boxed.join('   '))
    for (const state of states) {
      for (const transition of drawable.transitions.filter((edge) => edge.from === state)) {
        const to = transition.to
        const arrow = depth.get(to) === level ? '->' : depth.get(to) === level + 1 ? '|' : 'v'
        lines.push('  ' + arrow + ' ' + (transition.label === undefined || transition.label === '' ? '' : shorten(transition.label) + ' -> ') + to)
      }
    }
    if (level !== ordered[ordered.length - 1]) lines.push('')
  }
  return lines
}

/** The legend a reader needs to read the drawing without being told: initial state versus the rest. */
export function diagramLegend(drawable: Drawable): string | undefined {
  if (drawable.states.length === 0) return undefined
  if (drawable.states.length > DRAW_LIMIT.states || drawable.transitions.length > DRAW_LIMIT.transitions) return undefined
  return '((initial)) and [state]; each edge is listed under the level it leaves'
}
