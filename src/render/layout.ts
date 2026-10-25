/**
 * Ranks for a machine: which row each state sits in.
 *
 * Breadth-first from the initial state, which is the layout the reader expects and the one Sugiyama's
 * layered drawing asks for: edges mostly flow down, and a state's row is how far it is from the start. A
 * state nothing reaches goes in a last row of its own rather than being dropped - an unreachable state is
 * usually the finding.
 *
 * Pure, and the whole of the layout for now: no crossing minimisation, no coordinate assignment.
 */

import type { DiagramNode, DiagramEdge } from './viewmodel.js'

export interface Ranked {
  /** Row index per state id, in the order the rows should be drawn. */
  rows: string[][]
  /** States that no edge reaches from the initial one. */
  unreachable: string[]
}

export function rankStates(nodes: DiagramNode[], edges: DiagramEdge[], init: string | undefined): Ranked {
  const ids = nodes.map((node) => node.id)
  const known = new Set(ids)
  const start = init !== undefined && known.has(init) ? init : ids[0]
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue
    const list = outgoing.get(edge.from) ?? []
    list.push(edge.to)
    outgoing.set(edge.from, list)
  }
  const depth = new Map<string, number>()
  if (start !== undefined) {
    depth.set(start, 0)
    // Each entry carries its own depth, so the walk never looks one up: a lookup here would need a default
    // for a case that cannot happen.
    const queue: Array<{ id: string; level: number }> = [{ id: start, level: 0 }]
    while (queue.length > 0) {
      const { id, level } = queue.shift() as { id: string; level: number }
      for (const target of outgoing.get(id) ?? []) {
        // A cycle revisits a state already placed: the first visit fixes the row, and the second is not a
        // reason to move it.
        if (depth.has(target)) continue
        depth.set(target, level + 1)
        queue.push({ id: target, level: level + 1 })
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
