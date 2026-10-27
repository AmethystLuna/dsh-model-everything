/**
 * The graph the layout stages agree on, and the order they start from.
 *
 * A layout stage has no business knowing what a diagram is: it sees boxes with a size and edges
 * between them. That is what `LayoutGraph` is, and it is the whole vocabulary the pipeline shares -
 * cycle breaking reads it, layering writes layers, ordering and coordinate assignment read those.
 *
 * `rankStates` stays: it is the breadth-first order a source's own reading suggests, and it seeds
 * the ordering stage with the discovery order instead of whatever order the parser happened to
 * collect. It no longer decides which row a state is in - `layer.ts` does that now - so the rows it
 * returns are only a first guess at the left-to-right order.
 *
 * Pure, and asserted on the answer itself.
 */

/** A box to place: an id, and the space its text needs. */
export interface LayoutNode {
  id: string
  width: number
  height: number
}

/** An edge to draw: which two boxes it joins, and which diagram edge it came from. */
export interface LayoutEdge {
  /** The index in the diagram's own edge list, so the drawing can report a lane back for it. */
  index: number
  from: string
  to: string
}

/** One level of a nested drawing: what is placed together in a single pass of the pipeline. */
export interface LayoutGraph {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  /** The box that must stay on layer zero, when the source named one. */
  init?: string
}

export interface Ranked {
  /** The state ids of each row, top to bottom, already ordered left to right. */
  rows: string[][]
  /** States no edge reaches from the initial one. */
  unreachable: string[]
}

export function rankStates(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ from: string; to: string }>,
  init: string | undefined,
): Ranked {
  const ids = nodes.map((node) => node.id)
  const known = new Set(ids)
  const start = init !== undefined && known.has(init) ? init : ids[0]

  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }

  const depth = new Map<string, number>()
  if (start !== undefined) {
    depth.set(start, 0)
    const queue: string[] = [start]
    while (queue.length > 0) {
      const id = queue.shift() as string
      const level = depth.get(id) as number
      for (const target of outgoing.get(id) ?? []) {
        if (depth.has(target)) continue
        depth.set(target, level + 1)
        queue.push(target)
      }
    }
  }

  const rows: string[][] = []
  for (const id of ids) {
    const level = depth.get(id)
    if (level === undefined) continue
    while (rows.length <= level) rows.push([])
    rows[level].push(id)
  }

  return { rows, unreachable: ids.filter((id) => !depth.has(id)) }
}

/**
 * The left-to-right seed the ordering stage starts from.
 *
 * Breadth-first discovery is what a reader expects a drawing to follow, so it is a better first
 * guess than the order the parser collected. A state nothing reaches has no discovery order and
 * keeps the order it was written in, after everything that was reached.
 */
export function seedOrder(graph: LayoutGraph): Map<string, number> {
  const ranked = rankStates(graph.nodes, graph.edges, graph.init)
  const order = new Map<string, number>()
  let index = 0
  for (const row of ranked.rows) for (const id of row) order.set(id, index++)
  for (const id of ranked.unreachable) order.set(id, index++)
  return order
}