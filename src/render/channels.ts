/**
 * Channel assignment: where the vertical lanes and the horizontal runs between two rows go.
 *
 * The stages before this one decide where the boxes are, and the painter decides what a box looks like. What is left
 * is the space between two rows, and an edge that decides that space alone will collide with the next one: every long
 * edge has to cross a row somewhere, and every edge whose two ends are not vertically aligned needs one horizontal run
 * inside the gap it crosses. Chosen independently, two runs land on one height and read as a junction, and a run
 * sweeps across a vertical another edge is already using.
 *
 * So this stage assigns both, after the boxes have settled and before anything is drawn:
 *
 * - **A lane's x.** A long edge owns one vertical lane through the rows it crosses. The x is a position no box
 *   occupies in any of those rows, and lanes keep the order their dummies have in the ordering, so two lanes never
 *   share an x inside one gap. Alignment is worth a detour: a lane that lands inside a box's own port span turns a
 *   four-bend staircase into a straight drop, so alignment comes before distance from the proposed position.
 * - **A run's y.** The horizontal runs inside one gap are stacked at distinct heights - Graphviz's virtual nodes - so
 *   two runs never lie on one line, and a nested run stays near the box it leaves.
 *
 * Pure: rows, chains and coordinates in; lane positions and run heights out.
 */

import type { Chain } from './dummy.js'

/** A box, as far as routing is concerned: only a box can move a lane. */
export interface ChannelBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ChannelInput {
  /** The ordered rows, dummies included: a lane keeps its dummy's order. */
  layers: string[][]
  /** Every edge's chain, from the layout source to the layout target. */
  chains: Chain[]
  /** A dummy instance, and the lane it belongs to. */
  chainOf: ReadonlyMap<string, string>
  /** The boxes that block a lane. A dummy has none. */
  boxes: ReadonlyMap<string, ChannelBox>
  /** The top of each row, and how tall it is. */
  layerY: number[]
  layerHeight: number[]
  /** What coordinate assignment proposed for each lane. */
  laneX: ReadonlyMap<string, number>
}

export interface ChannelOptions {
  /** How far a lane stays from a box in a row it crosses. */
  clearance: number
  /** The narrowest two lanes sharing a gap may be. */
  spacing: number
}

/** One long edge's lane: the x of its vertical run, and the height of a run in each gap it crosses. */
export interface LaneChannel {
  x: number
  y: number[]
}

export interface ChannelPlan {
  /** By diagram edge index: the lane a long edge reserved, with one corridor height per gap it crosses. */
  lanes: Map<number, LaneChannel>
  /** By diagram edge index: the height of the one run an edge between two adjacent rows needs. */
  runs: Map<number, number>
}

/** How far a port sits from a box's corner. The painter places ports from this same number. */
export const PORT_INSET = 10

/** An x-interval, open at either end when nothing bounds it. */
interface Span {
  lo: number
  hi: number
}

/** The x's a port may sit at on a box's top or bottom side. */
function spanOf(box: ChannelBox): Span {
  const lo = box.x + PORT_INSET
  const hi = box.x + box.width - PORT_INSET
  return hi > lo ? { lo, hi } : { lo: box.x + box.width / 2, hi: box.x + box.width / 2 }
}

function clamp(value: number, span: Span): number {
  return Math.min(span.hi, Math.max(span.lo, value))
}

function inside(value: number, span: Span): boolean {
  return value >= span.lo - 0.001 && value <= span.hi + 0.001
}

/** The intervals a blocked strip cuts out of the free ones. */
function cut(free: Span[], blocked: Span): Span[] {
  const out: Span[] = []
  for (const span of free) {
    if (blocked.hi <= span.lo || blocked.lo >= span.hi) {
      out.push(span)
      continue
    }
    if (blocked.lo > span.lo) out.push({ lo: span.lo, hi: blocked.lo })
    if (blocked.hi < span.hi) out.push({ lo: blocked.hi, hi: span.hi })
  }
  return out
}

/** The nearest free x at or after `value`: a lane pushed right never lands inside a box. */
function atOrAfter(value: number, free: Span[]): number {
  let found = value
  for (const span of free) {
    if (span.hi < value) continue
    found = Math.max(value, span.lo)
    break
  }
  return found
}

/** One long edge, and the space its lane may use. */
interface Long {
  edge: number
  lane: string
  /** The ids it passes through, dummies included. */
  path: string[]
  /** The rows it starts in and ends in. */
  from: number
  to: number
  /** The x-intervals free of boxes in every row it crosses. */
  free: Span[]
  source: Span
  target: Span
  /** What coordinate assignment proposed, and what was finally chosen. */
  proposal: number
  x: number
}

/** The x a lane takes: aligned with a box's own port if it can be, then the proposed position, then the detour. */
function choose(entry: Long): number {
  const candidates: number[] = [entry.proposal, entry.source.lo, entry.source.hi, entry.target.lo, entry.target.hi]
  candidates.push((clamp(entry.proposal, entry.source) + clamp(entry.proposal, entry.target)) / 2)
  // Ordered by what the drawing wants: no detour at either end first, then the position coordinate assignment
  // proposed, then the shorter detour. A free x is never this stage's to invent - the corridor is already there.
  let best = entry.proposal
  let bestBends = Infinity
  let bestFar = Infinity
  let bestReach = Infinity
  for (const span of entry.free) {
    for (const value of candidates) {
      const x = clamp(value, span)
      const bends = (inside(x, entry.source) ? 0 : 1) + (inside(x, entry.target) ? 0 : 1)
      const far = Math.abs(x - entry.proposal)
      const reach = Math.abs(x - clamp(x, entry.source)) + Math.abs(x - clamp(x, entry.target))
      const better =
        bends < bestBends ||
        (bends === bestBends && (far < bestFar - 0.001 || (Math.abs(far - bestFar) <= 0.001 && reach < bestReach)))
      if (!better) continue
      best = x
      bestBends = bends
      bestFar = far
      bestReach = reach
    }
  }
  return best
}

/**
 * The two ports the painter will place for an edge between two adjacent rows.
 *
 * The painter reads the side off the rows and the position off the box the edge points at; this repeats that rule so
 * the run's height can be stacked against the runs it will actually share a gap with.
 */
function adjacentPorts(source: ChannelBox, target: ChannelBox): { from: number; to: number } {
  const fromMiddle = source.x + source.width / 2
  const toMiddle = target.x + target.width / 2
  const fromSpan = spanOf(source)
  const toSpan = spanOf(target)
  const chosen = inside(fromMiddle, toSpan) ? fromMiddle : clamp(toMiddle, fromSpan)
  return { from: clamp(chosen, fromSpan), to: clamp(chosen, toSpan) }
}

export function assignChannels(input: ChannelInput, options: ChannelOptions): ChannelPlan {
  const { layers, chains, chainOf, boxes, layerY, layerHeight, laneX } = input
  const rowOf = new Map<string, number>()
  layers.forEach((row, depth) => {
    for (const id of row) rowOf.set(id, depth)
  })

  // A lane's x: free in every row it crosses, and reachable from both ends.
  const long: Long[] = []
  for (const chain of chains) {
    if (chain.path.length <= 2) continue
    const head = chain.path[0] as string
    const tail = chain.path[chain.path.length - 1] as string
    const from = rowOf.get(head)
    const to = rowOf.get(tail)
    if (from === undefined || to === undefined || to <= from) continue
    const lane = chainOf.get(chain.path[1] as string)
    const source = boxes.get(head)
    const target = boxes.get(tail)
    // A lane into a boundary has no box to arrive at: that edge is the router's.
    if (lane === undefined || source === undefined || target === undefined) continue
    let free: Span[] = [{ lo: -Infinity, hi: Infinity }]
    for (let depth = from + 1; depth < to; depth += 1) {
      for (const id of layers[depth] as string[]) {
        const box = boxes.get(id)
        if (box === undefined) continue
        free = cut(free, { lo: box.x - options.clearance, hi: box.x + box.width + options.clearance })
      }
    }
    const centre = (source.x + source.width / 2 + target.x + target.width / 2) / 2
    long.push({
      edge: chain.index,
      lane,
      path: chain.path,
      from,
      to,
      free,
      source: spanOf(source),
      target: spanOf(target),
      proposal: laneX.get(lane) ?? centre,
      x: 0,
    })
  }
  for (const entry of long) entry.x = choose(entry)

  // The order inside a gap: two lanes never share an x, and the left one is the one the ordering put left.
  const byGap = new Map<number, Array<{ entry: Long; index: number }>>()
  for (const entry of long) {
    for (let gap = entry.from; gap < entry.to; gap += 1) {
      // The dummy in the lower row of the gap; the last gap has none, and its upper row's dummy orders it.
      const row = gap + 1 < entry.to ? gap + 1 : gap
      const id = entry.path[row - entry.from] as string
      const index = (layers[row] as string[]).indexOf(id)
      byGap.set(gap, [...(byGap.get(gap) ?? []), { entry, index }])
    }
  }
  for (const [, list] of byGap) list.sort((left, right) => left.index - right.index)
  for (let round = 0; round < 4; round += 1) {
    let moved = false
    for (const [, list] of byGap) {
      let previous = -Infinity
      for (const item of list) {
        const x = item.entry.x < previous + options.spacing ? atOrAfter(previous + options.spacing, item.entry.free) : item.entry.x
        if (x !== item.entry.x) {
          item.entry.x = x
          moved = true
        }
        previous = item.entry.x
      }
    }
    if (!moved) break
  }

  // The runs: one per edge end that does not land on its lane, stacked at distinct heights inside the gap.
  const stacks = new Map<number, Array<{ edge: number; gap: number; left: number }>>()
  const want = (gap: number, edge: number, left: number): void => {
    stacks.set(gap, [...(stacks.get(gap) ?? []), { edge, gap, left }])
  }
  for (const entry of long) {
    const head = clamp(entry.x, entry.source)
    const tail = clamp(entry.x, entry.target)
    if (Math.abs(head - entry.x) > 0.5) want(entry.from, entry.edge, Math.min(head, entry.x))
    if (Math.abs(tail - entry.x) > 0.5) want(entry.to - 1, entry.edge, Math.min(tail, entry.x))
  }
  for (const chain of chains) {
    if (chain.path.length > 2) continue
    const head = chain.path[0] as string
    const tail = chain.path[chain.path.length - 1] as string
    const from = rowOf.get(head)
    const to = rowOf.get(tail)
    if (from === undefined || to === undefined || Math.abs(from - to) !== 1) continue
    const source = boxes.get(head)
    const target = boxes.get(tail)
    if (source === undefined || target === undefined) continue
    const ports = adjacentPorts(source, target)
    want(Math.min(from, to), chain.index, Math.min(ports.from, ports.to))
  }

  // A gap always has a row below it, so its strip is bounded: one stack per gap, inside that strip.
  const midOf = (gap: number): number => (layerY[gap] + layerHeight[gap] + layerY[gap + 1]) / 2
  const heightOf = new Map<number, Map<number, number>>()
  for (const [gap, list] of stacks) {
    const top = layerY[gap] + layerHeight[gap]
    const bottom = layerY[gap + 1]
    const pad = Math.min(8, Math.max(1, (bottom - top) / 3))
    const lo = top + pad
    const hi = Math.max(lo, bottom - pad)
    // Left to right, so a run that stays near its box sits near the row it left.
    const sorted = [...list].sort((left, right) => left.left - right.left || left.edge - right.edge)
    sorted.forEach((item, index) => {
      const y = sorted.length === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * (index + 1)) / (sorted.length + 1)
      const heights = heightOf.get(item.edge) ?? new Map<number, number>()
      heights.set(item.gap, y)
      heightOf.set(item.edge, heights)
    })
  }

  const lanes = new Map<number, LaneChannel>()
  for (const entry of long) {
    const y: number[] = []
    for (let gap = entry.from; gap < entry.to; gap += 1) y.push(heightOf.get(entry.edge)?.get(gap) ?? midOf(gap))
    lanes.set(entry.edge, { x: entry.x, y })
  }
  const runs = new Map<number, number>()
  for (const [edge, heights] of heightOf) {
    // A long edge's heights belong to its lane; an edge between two rows has the one run it asked for.
    if (lanes.has(edge)) continue
    runs.set(edge, [...heights.values()][0])
  }
  return { lanes, runs }
}
