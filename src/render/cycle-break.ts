/**
 * Cycle breaking, in the order a layered layout does it.
 *
 * A layered drawing is a drawing of a DAG: an edge that runs back up the page has no layer to go to. The fix is to
 * lay such an edge out backwards and draw its arrow the way the source wrote it - but *which* edges to turn around
 * is a decision, and deciding it edge by edge is what makes two back edges of one cycle end up pointing opposite
 * ways.
 *
 * So the graph is decomposed first. Tarjan's algorithm finds the strongly connected components; contracting each to
 * a node gives the condensation, which is a DAG, so every edge between components already points one way and nothing
 * between them needs reversing. Only inside a component - where by definition every edge lies on a cycle - is there
 * an order to choose: the nodes are ranked once, greedily, and every edge inside the component is oriented along that
 * single ranking. One ranking per component is what "consistently" means: after the pass, every surviving edge of a
 * component points from a lower rank to a higher one, so the component cannot contain a cycle any more.
 *
 * The initial state is a special case: it is layer zero by definition, so an edge that runs into it is a back edge
 * before the decomposition even starts. Turning those around leaves the state with no predecessor, so the ranking
 * of its component puts it first and nothing is ever oriented back into it.
 *
 * Pure: the same graph in, the same edge directions out.
 */

import type { LayoutEdge, LayoutGraph } from './layout.js'

/** One strongly connected component: a set of nodes that can all reach each other. */
export interface Component {
  /** The component's index in the condensation, numbered in topological order. */
  id: number
  members: string[]
}

export interface BrokenGraph {
  /** The same edges, in the same order, with the ones that close a cycle turned around. */
  edges: LayoutEdge[]
  /** The diagram edges whose direction the layout changed. */
  reversed: Set<number>
  /** The strongly connected components, numbered in topological order. */
  components: Component[]
  componentOf: Map<string, number>
  /** Each node's rank inside its own component: every intra-component edge points from a lower rank to a higher. */
  rank: Map<string, number>
  /** The condensation: an edge per pair of components that has at least one edge between them. Always acyclic. */
  condensation: Array<{ from: number; to: number }>
}

/** Tarjan's strongly connected components, iterative enough to be read: the recursion is the algorithm. */
function tarjan(nodes: string[], outgoing: Map<string, string[]>): string[][] {
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const found: string[][] = []
  const visit = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const next of outgoing.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number))
        continue
      }
      if (onStack.has(next)) low.set(node, Math.min(low.get(node) as number, index.get(next) as number))
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    let member: string
    do {
      member = stack.pop() as string
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    found.push(component)
  }
  for (const node of nodes) if (!index.has(node)) visit(node)
  return found
}

export function breakCycles(graph: LayoutGraph): BrokenGraph {
  const known = new Set(graph.nodes.map((node) => node.id))
  const position = new Map(graph.nodes.map((node, offset) => [node.id, offset] as const))
  const edges = graph.edges.map((edge) => ({ ...edge }))
  const reversed = new Set<number>()
  const flip = (index: number): void => {
    const edge = edges[index]
    const next = edge.from
    edge.from = edge.to
    edge.to = next
  }

  // The initial state is layer zero: every edge running into it is a back edge already.
  if (graph.init !== undefined && known.has(graph.init)) {
    for (const [index, edge] of edges.entries()) {
      if (edge.to === graph.init && edge.from !== graph.init) flip(index)
    }
  }

  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to) || edge.from === edge.to) continue
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }
  const nodes = graph.nodes.map((node) => node.id)
  const raw = tarjan(nodes, outgoing)
  // Tarjan emits a component after everything it reaches, which is the reverse of a topological order.
  raw.reverse()

  const componentOf = new Map<string, number>()
  const components: Component[] = raw.map((members, id) => {
    for (const member of members) componentOf.set(member, id)
    return { id, members }
  })

  const condensation: Array<{ from: number; to: number }> = []
  const seen = new Set<string>()
  for (const edge of edges) {
    const from = componentOf.get(edge.from)
    const to = componentOf.get(edge.to)
    if (from === undefined || to === undefined || from === to) continue
    const key = String(from) + '>' + String(to)
    if (seen.has(key)) continue
    seen.add(key)
    condensation.push({ from, to })
  }

  // Inside each component: one ranking, decided greedily by how much of the flow leaves the node rather than enters
  // it. That is the order the edges are made to follow, so no two decisions can contradict each other.
  const rank = new Map<string, number>()
  for (const component of components) {
    if (component.members.length < 2) {
      rank.set(component.members[0], 0)
      continue
    }
    const inside = new Set(component.members)
    const score = new Map<string, number>()
    for (const member of component.members) score.set(member, 0)
    for (const edge of edges) {
      if (!inside.has(edge.from) || !inside.has(edge.to) || edge.from === edge.to) continue
      score.set(edge.from, (score.get(edge.from) as number) + 1)
      score.set(edge.to, (score.get(edge.to) as number) - 1)
    }
    const ordered = [...component.members].sort((left, right) => {
      const difference = (score.get(right) as number) - (score.get(left) as number)
      return difference !== 0 ? difference : (position.get(left) as number) - (position.get(right) as number)
    })
    ordered.forEach((member, offset) => rank.set(member, offset))
  }

  for (const [index, edge] of edges.entries()) {
    const from = rank.get(edge.from)
    const to = rank.get(edge.to)
    if (from === undefined || to === undefined || edge.from === edge.to) continue
    if (componentOf.get(edge.from) !== componentOf.get(edge.to)) continue
    if (from > to) flip(index)
  }

  edges.forEach((edge, index) => {
    if (graph.edges[index].from !== edge.from) reversed.add(edge.index)
  })
  return { edges, reversed, components, componentOf, rank, condensation }
}
