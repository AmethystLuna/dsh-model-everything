/**
 * Ranks for a machine, and the order of states within each rank.
 *
 * Breadth-first from the initial state decides the row: the layout a reader expects, and the one a layered
 * drawing asks for - edges mostly flow down, and a state's row is how far it is from the start. A state
 * nothing reaches goes in a block of its own rather than being dropped.
 *
 * Within a row, states are ordered by the mean position of their predecessors - the barycentre pass - because a
 * graph is not a tree: a node with several parents has to sit between them, and a row that keeps the order the
 * walk found it in draws two long edges crossing for no reason. Two sweeps are enough for a drawing this size;
 * a third has never moved anything in the fixtures.
 *
 * Pure, and asserted on the rows themselves.
 */

import type { DiagramEdge, DiagramNode } from './model.js'

export interface Ranked {
  /** The state ids of each row, top to bottom, already ordered left to right. */
  rows: string[][]
  /** States no edge reaches from the initial one. */
  unreachable: string[]
}

export function rankStates(nodes: DiagramNode[], edges: DiagramEdge[], init: string | undefined): Ranked {
  const ids = nodes.map((node) => node.id)
  const known = new Set(ids)
  const start = init !== undefined && known.has(init) ? init : ids[0]

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from])
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
