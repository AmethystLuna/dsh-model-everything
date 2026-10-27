/**
 * Minimum-length ranking: the network simplex of Gansner, Koutsofios, North and Vo (1993).
 *
 * The ranking problem: give every node a layer such that each edge spans at least its minimum length, and make the
 * total of all the slack - the layers every edge spans beyond its minimum - as small as it can be. Slack is what a
 * reader pays for: an edge that spans three layers has to be drawn through two of them.
 *
 * Longest paths are one feasible answer and they are not the best one. They put every node as high as it can
 * possibly go, which leaves a node whose edges leave it with nothing to do above the boxes it points at. The best
 * answer is the solution of a linear program, and network simplex is how the mature layering implementations solve
 * it: hold a *feasible tree* - a spanning tree every edge of which is tight - and a ranking that tightens it, attach
 * a *cut value* to each tree edge (the weight flowing one way across that cut minus the weight flowing the other),
 * and while some tree edge has a negative cut value, take it out, let the cheapest edge across its cut in, and move
 * the ranks so the new edge is tight. The cut value is the rate at which the total length falls as the tree edge is
 * left out, so every exchange shortens the drawing, and a tree with no negative cut value is the optimum: no single
 * exchange is left that would shorten it, and for this program that is the definition of optimal.
 *
 * Three things are done differently from the paper, each because this graph is not the paper's graph:
 *
 * - **Components are solved one at a time.** The ranking is translation invariant, so two components that share no
 *   edge can be laid out apart from each other; each is solved on its own and its top row is then numbered zero.
 * - **A node may be pinned to the top.** A state machine has an initial state and a reader expects it first, so the
 *   stage can name one node that must be on the topmost layer: a zero-length, zero-weight constraint edge runs from
 *   it to every other node of its component (`rank(v) >= rank(pinned)`), and the ranking is minimised subject to that.
 *   The constraint costs length when the free optimum would have put the pinned node below another source, and that
 *   price is what "the initial state is first" means.
 * - **The iteration is capped.** A degenerate exchange (one that moves nothing) is legal and in theory can go round
 *   in circles. The cap turns that into a ranking that is feasible and no worse than where it started.
 *
 * Pure, and generic in the ranking program: no ids, no sizes, no drawing.
 */

/** One edge of the ranking program: two layers, how far apart they may be, and what one layer of slack costs. */
export interface RankEdge {
  from: number
  to: number
  /** The least number of layers this edge may span. One for an edge that is drawn, zero for a constraint. */
  minLength: number
  /** What one extra layer on this edge costs. Zero for a constraint, which must hold but is not worth shortening. */
  weight: number
}

export interface RankProblem {
  count: number
  edges: RankEdge[]
  /** A feasible ranking to start from: it already gives every edge at least its minimum length. */
  start: number[]
  /**
   * The node that has to sit on the topmost layer, when the source named one.
   *
   * It has to be a node nothing points at, or no ranking can hold it at the top - a predecessor forces it down. The
   * constraint is dropped when the start ranking cannot satisfy it.
   */
  pinned?: number
}

/** How many layers this edge spans beyond its minimum: at least zero in a feasible ranking. */
function slackOf(edge: RankEdge, rank: number[]): number {
  return rank[edge.to] - rank[edge.from] - edge.minLength
}

/** The nodes of each weakly connected component, in index order, each list in index order. */
function componentsOf(count: number, edges: RankEdge[]): number[][] {
  const neighbours: number[][] = []
  for (let node = 0; node < count; node += 1) neighbours.push([])
  for (const edge of edges) {
    neighbours[edge.from].push(edge.to)
    neighbours[edge.to].push(edge.from)
  }
  const seen = new Array<boolean>(count).fill(false)
  const components: number[][] = []
  for (let node = 0; node < count; node += 1) {
    if (seen[node]) continue
    seen[node] = true
    const members = [node]
    for (let head = 0; head < members.length; head += 1) {
      for (const next of neighbours[members[head]]) {
        if (seen[next]) continue
        seen[next] = true
        members.push(next)
      }
    }
    members.sort((left, right) => left - right)
    components.push(members)
  }
  return components
}

/**
 * A spanning tree of tight edges, built one edge at a time.
 *
 * A tight edge is one of the tree's to grow on: it already spans exactly its minimum, so it constrains the ranking
 * without costing anything. When no tight edge reaches out of the tree, no tree can be grown from here without
 * moving something: the nodes outside the tree are shifted as one block until a crossing edge is tight. The block
 * moves by the largest amount that keeps every crossing edge feasible, which is the smaller of the two bounds the
 * crossing edges impose - one per direction - so one edge becomes tight and none goes negative.
 */
function buildTightTree(members: number[], edges: RankEdge[], rank: number[], tree: Set<number>): void {
  const inside = new Set<number>([members[0]])
  while (inside.size < members.length) {
    let tight = -1
    for (const [index, edge] of edges.entries()) {
      if (tree.has(index)) continue
      if (inside.has(edge.from) === inside.has(edge.to)) continue
      if (slackOf(edge, rank) === 0) {
        tight = index
        break
      }
    }
    if (tight >= 0) {
      tree.add(tight)
      inside.add(edges[tight].from)
      inside.add(edges[tight].to)
      continue
    }
    // Nothing tight leaves the tree: slide everything outside it until something does. An edge leaving the tree
    // gains a layer of slack per unit of the slide and an edge entering it loses one, so the feasible slides are the
    // interval between the two bounds, and the bound that is not zero is where an edge becomes tight.
    let lowest = -Infinity
    let highest = Infinity
    for (const edge of edges) {
      const from = inside.has(edge.from)
      const to = inside.has(edge.to)
      if (from === to) continue
      const slack = slackOf(edge, rank)
      if (from) lowest = Math.max(lowest, -slack)
      else highest = Math.min(highest, slack)
    }
    if (lowest === -Infinity && highest === Infinity) return
    const step = lowest > -Infinity ? lowest : highest
    if (step === 0) return
    for (const node of members) if (!inside.has(node)) rank[node] += step
  }
}

/** The tree's parents and subtree extents, read off one depth-first walk. */
interface TreeWalk {
  /** For each node, its parent, or -1 for the root. */
  parent: Map<number, number>
  /** The preorder position of each node, and how many nodes its subtree holds. */
  first: Map<number, number>
  size: Map<number, number>
  order: number[]
}

function walkTree(members: number[], edges: RankEdge[], tree: Set<number>): TreeWalk {
  const adjacency = new Map<number, Array<{ node: number }>>()
  const link = (node: number, other: number): void => {
    adjacency.set(node, [...(adjacency.get(node) ?? []), { node: other }])
  }
  for (const index of tree) {
    const edge = edges[index]
    link(edge.from, edge.to)
    link(edge.to, edge.from)
  }
  const parent = new Map<number, number>()
  const first = new Map<number, number>()
  const size = new Map<number, number>()
  const order: number[] = []
  const seen = new Set<number>()
  const root = members[0]
  const stack = [root]
  seen.add(root)
  parent.set(root, -1)
  while (stack.length > 0) {
    const node = stack.pop() as number
    first.set(node, order.length)
    order.push(node)
    for (const step of adjacency.get(node) ?? []) {
      if (seen.has(step.node)) continue
      seen.add(step.node)
      parent.set(step.node, node)
      stack.push(step.node)
    }
  }
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const node = order[index]
    size.set(node, (size.get(node) ?? 0) + 1)
    const above = parent.get(node)
    if (above !== undefined && above >= 0) size.set(above, (size.get(above) ?? 0) + (size.get(node) as number))
  }
  return { parent, first, size, order }
}

/**
 * Solve one component in place: grow a tight tree, exchange until no cut value is negative, then number its top row
 * zero.
 */
function solveComponent(size: number, members: number[], edges: RankEdge[], rank: number[]): void {
  if (members.length < 2) {
    if (members.length === 1) rank[members[0]] = 0
    return
  }
  const tree = new Set<number>()
  buildTightTree(members, edges, rank, tree)
  // A tree that does not span cannot be exchanged on; the start ranking is still feasible, so it is what is kept.
  const spanning = tree.size === members.length - 1
  if (spanning) improve(size, members, edges, tree, rank)

  let top = Infinity
  for (const node of members) top = Math.min(top, rank[node])
  for (const node of members) rank[node] -= top
}

function improve(size: number, members: number[], edges: RankEdge[], tree: Set<number>, rank: number[]): void {
  const incoming = new Float64Array(size)
  const outgoing = new Float64Array(size)
  for (const edge of edges) {
    outgoing[edge.from] += edge.weight
    incoming[edge.to] += edge.weight
  }
  const cap = Math.max(50, 8 * members.length + 4 * edges.length)
  for (let iteration = 0; iteration < cap; iteration += 1) {
    const walk = walkTree(members, edges, tree)
    // A subtree's cut value is what enters it minus what leaves it, or the other way round: which of the two is the
    // tail side of the tree edge decides the sign. Removing a tree edge splits the tree in two, and the side holding
    // the edge's tail is the one the value is read from.
    const entering = new Map<number, number>()
    const leaving = new Map<number, number>()
    for (let index = walk.order.length - 1; index >= 0; index -= 1) {
      const node = walk.order[index]
      entering.set(node, incoming[node] + (entering.get(node) ?? 0))
      leaving.set(node, outgoing[node] + (leaving.get(node) ?? 0))
      const above = walk.parent.get(node)
      if (above === undefined || above < 0) continue
      entering.set(above, (entering.get(above) ?? 0) + (entering.get(node) as number))
      leaving.set(above, (leaving.get(above) ?? 0) + (leaving.get(node) as number))
    }
    const holds = (node: number, child: number): boolean => {
      const start = walk.first.get(child) as number
      const at = walk.first.get(node) as number
      return at >= start && at < start + (walk.size.get(child) as number)
    }

    let worst = -1
    let worstEdge = -1
    let worstChild = -1
    for (const index of tree) {
      const edge = edges[index]
      const child = walk.parent.get(edge.from) === edge.to ? edge.from : edge.to
      const tailInside = holds(edge.from, child)
      const value = tailInside
        ? (leaving.get(child) as number) - (entering.get(child) as number)
        : (entering.get(child) as number) - (leaving.get(child) as number)
      if (value < 0 && (worstEdge < 0 || value < worst)) {
        worst = value
        worstEdge = index
        worstChild = child
      }
    }
    if (worstEdge < 0) return

    // The head side of the leaving edge is moved down, which shortens every edge running from it to the tail side.
    // The move is as far as the first of those edges allows, and that edge becomes the one that enters the tree.
    const leavingEdge = edges[worstEdge]
    const headInside = !holds(leavingEdge.from, worstChild)
    const inHead = (node: number): boolean => (headInside ? holds(node, worstChild) : !holds(node, worstChild))
    let enteringEdge = -1
    let step = Infinity
    for (const [index, edge] of edges.entries()) {
      if (tree.has(index)) continue
      if (!inHead(edge.from) || inHead(edge.to)) continue
      const slack = slackOf(edge, rank)
      if (slack < step || (slack === step && (enteringEdge < 0 || index < enteringEdge))) {
        step = slack
        enteringEdge = index
      }
    }
    if (enteringEdge < 0 || step === Infinity) return
    if (step !== 0) for (const node of members) if (inHead(node)) rank[node] += step
    tree.delete(worstEdge)
    tree.add(enteringEdge)
  }
}

export function minimumLength(problem: RankProblem): number[] {
  const rank = problem.start.slice()
  for (const members of componentsOf(problem.count, problem.edges)) {
    const inside = new Set(members)
    const local = problem.edges.filter((edge) => inside.has(edge.from) && inside.has(edge.to))
    const pinned = problem.pinned !== undefined && inside.has(problem.pinned) ? problem.pinned : undefined
    // The pin is a set of zero-length constraints from the pinned node to the rest of its component. It is only
    // feasible when the start ranking already holds the pinned node at the top of its component.
    const pinnedRank = pinned === undefined ? undefined : rank[pinned]
    if (pinned !== undefined && pinnedRank !== undefined && members.every((node) => rank[node] >= pinnedRank)) {
      for (const node of members) if (node !== pinned) local.push({ from: pinned, to: node, minLength: 0, weight: 0 })
    }
    solveComponent(problem.count, members, local, rank)
  }
  return rank
}
