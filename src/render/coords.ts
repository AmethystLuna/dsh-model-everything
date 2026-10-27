/**
 * Coordinate assignment: how far right each box sits. Brandes-Kopf.
 *
 * The layers are rows and the order inside them is settled; the only freedom left is the x of each box. Three
 * properties make a drawing readable:
 *
 * - A box sits over what it is connected to, and a chain of boxes sits on one vertical line. Brandes and Kopf get
 *   this by *aligning*: every box is offered the median of its neighbours in the layer just above (or just below) and
 *   is joined to that neighbour's block when the join crosses no other edge. A block is then one node of a smaller
 *   graph, and a box that aligned downwards through five rows comes out as one straight segment.
 * - Nothing overlaps, and the empty strip between two boxes in a row is the same everywhere. The blocks are compacted
 *   against each other by the least distance their rows allow, which is a longest path over the block graph: a block
 *   sits as far left as the block to its left permits, and no further.
 * - The drawing is balanced rather than packed to one side. Aligning downwards alone would lean everything left, so
 *   the same two passes are run from the bottom up, and each pair is run once more mirrored left to right. The four
 *   layouts are then averaged. Averaging is a convex combination, and the separation constraints are linear, so the
 *   average of four layouts that keep the boxes apart also keeps them apart - the balance is free of overlaps by
 *   construction. A pass that starts at the top and one that starts at the bottom compact their blocks from opposite
 *   ends, so each side is first slid onto the origin of the first pass of that side, and only then averaged.
 *
 * Three things this module owes the rest of the pipeline rather than the paper:
 *
 * - A long edge's dummies share one x. They are one lane, not one point per row, so each lane is collapsed to the mean
 *   of the x its two ends want - the straight drop a reader follows. Collapsing can put a lane where a box already is,
 *   so the last pass spends the lane's space: boxes are pushed right past it and never the other way, and a row keeps
 *   the width its placeholders were given, which is the width a corridor needs when the lane has to go around a box.
 *   The lane is a proposal either way - the channel stage moves a lane into a free corridor when routing needs it, and
 *   a box never moves for a lane.
 * - A lane is not a neighbour to be aligned with. A box that aligned itself to a lane passing through its row would be
 *   pulled off the boxes it does connect to, which is how a decision with one long edge comes out as a staircase. Lanes
 *   are placed by the compaction and then by the channel stage, which is where a lane belongs.
 * - The empty strip between two rows is the caller's, not this module's: the y of a row is a running sum with one gap.
 *
 * Pure: layers and chains in, coordinates out.
 */

import type { Chain } from './dummy.js'

export interface Sized {
  width: number
  height: number
}

export interface CoordInput {
  layers: string[][]
  chains: Chain[]
  sizeOf: (id: string) => Sized
  /** A dummy instance, and the shared lane it belongs to. */
  chainOf: ReadonlyMap<string, string>
}

export interface CoordOptions {
  /** The empty space between two side-by-side boxes. */
  gap: number
  /** The empty strip between two layers. */
  layerGap: number
}

export interface Coordinates {
  /** Centre x, keyed by node id and by lane id. A long edge's dummies share one entry. */
  x: Map<string, number>
  /** The top y of each layer. */
  layerY: number[]
  layerHeight: number[]
  layerWidth: number[]
  width: number
  height: number
}

/** What one pass needs: the rows in its own order, and where each id's neighbours in the row above it are. */
interface Frame {
  /** The rows, top to bottom in this pass's frame, each already in the pass's left-to-right order. */
  rows: string[][]
  /** For each id, the ids it is joined to in the previous row of this frame. */
  near: ReadonlyMap<string, string[]>
  /** True when this pass reads the rows mirror-image, so its coordinates have to be flipped back. */
  mirrored: boolean
}

/** Where each id sits inside its row, in the row's own order. */
function positions(rows: string[][]): Map<string, number> {
  const at = new Map<string, number>()
  for (const row of rows) row.forEach((id, index) => at.set(id, index))
  return at
}

/**
 * Join each id to the median of its neighbours in the row above, unless that join would cross another edge.
 *
 * One block per chain of joins, reported as the block's root per id. The `previous` cursor is the whole of the
 * crossing test: as ids are taken left to right, a neighbour has to be strictly right of the one the previous id was
 * joined to, and since the ids are taken in order that is exactly "the joins do not cross".
 */
function alignBlocks(frame: Frame, at: Map<string, number>): Map<string, string> {
  const root = new Map<string, string>()
  const joined = new Map<string, string>()
  for (const row of frame.rows) {
    for (const id of row) {
      root.set(id, id)
      joined.set(id, id)
    }
  }
  for (let depth = 1; depth < frame.rows.length; depth += 1) {
    let previous = -1
    for (const id of frame.rows[depth]) {
      // An id that already belongs to a block was joined to one from below or above: it cannot start another.
      if (joined.get(id) !== id) continue
      const close = frame.near.get(id) ?? []
      if (close.length === 0) continue
      const sorted = [...close].sort((left, right) => (at.get(left) as number) - (at.get(right) as number))
      const middle = (sorted.length - 1) / 2
      // An even number of neighbours has two medians. Both are tried, nearest first, so a box with two parents is as
      // happy under either as the paper's version.
      for (let cursor = Math.floor(middle); cursor <= Math.ceil(middle); cursor += 1) {
        if (joined.get(id) !== id) break
        const target = sorted[cursor]
        if (previous >= (at.get(target) as number)) continue
        joined.set(target, id)
        root.set(id, root.get(target) as string)
        joined.set(id, root.get(id) as string)
        previous = at.get(target) as number
      }
    }
  }
  return root
}

/**
 * Place the blocks: each one as far left as the block to its left in any row allows.
 *
 * That is a longest path over the block graph, whose edges run from a block to the block it has to clear, weighted by
 * the least distance between the two ids that forced the edge. Blocks cannot cross by construction, so the graph has
 * no cycle; the guard is there because a cycle would otherwise be an infinite recursion rather than a wrong drawing.
 */
function compactBlocks(rows: string[][], root: Map<string, string>, widthOf: (id: string) => number, gap: number): Map<string, number> {
  const clears = new Map<string, Array<{ block: string; space: number }>>()
  for (const row of rows) {
    for (let index = 1; index < row.length; index += 1) {
      const left = row[index - 1]
      const right = row[index]
      const leftBlock = root.get(left) as string
      const rightBlock = root.get(right) as string
      if (leftBlock === rightBlock) continue
      const space = (widthOf(left) + widthOf(right)) / 2 + gap
      clears.set(rightBlock, [...(clears.get(rightBlock) ?? []), { block: leftBlock, space }])
    }
  }
  const placed = new Map<string, number>()
  const open = new Set<string>()
  const place = (block: string): number => {
    const known = placed.get(block)
    if (known !== undefined) return known
    if (open.has(block)) return 0
    open.add(block)
    let value = 0
    for (const step of clears.get(block) ?? []) value = Math.max(value, place(step.block) + step.space)
    open.delete(block)
    placed.set(block, value)
    return value
  }
  const x = new Map<string, number>()
  for (const row of rows) {
    for (const id of row) {
      const block = root.get(id) as string
      if (!placed.has(block)) place(block)
      x.set(id, placed.get(block) as number)
    }
  }
  return x
}

/** The left edge of the leftmost box and the right edge of the rightmost, in one pass's coordinates. */
function extentOf(x: Map<string, number>, rows: string[][], widthOf: (id: string) => number): { left: number; right: number } {
  let left = Infinity
  let right = -Infinity
  for (const row of rows) {
    for (const id of row) {
      const value = x.get(id) as number
      left = Math.min(left, value - widthOf(id) / 2)
      right = Math.max(right, value + widthOf(id) / 2)
    }
  }
  return { left, right }
}

/** One pass: align the rows in this frame, compact the blocks, and flip the answer back if the frame is mirrored. */
function onePass(frame: Frame, widthOf: (id: string) => number, gap: number): Map<string, number> {
  const at = positions(frame.rows)
  const root = alignBlocks(frame, at)
  const x = compactBlocks(frame.rows, root, widthOf, gap)
  if (!frame.mirrored) return x
  const mirrored = new Map<string, number>()
  for (const [id, value] of x) mirrored.set(id, -value)
  return mirrored
}

/** The four passes a balanced layout needs: down and up, each read left to right and right to left. */
function frames(layers: string[][], above: ReadonlyMap<string, string[]>, below: ReadonlyMap<string, string[]>): Frame[] {
  const fromTop = layers
  const fromBottom = [...layers].reverse()
  const flip = (rows: string[][]): string[][] => rows.map((row) => [...row].reverse())
  return [
    { rows: fromTop, near: above, mirrored: false },
    { rows: flip(fromTop), near: above, mirrored: true },
    { rows: fromBottom, near: below, mirrored: false },
    { rows: flip(fromBottom), near: below, mirrored: true },
  ]
}

export function assignCoordinates(input: CoordInput, options: CoordOptions): Coordinates {
  const { layers, chains, sizeOf, chainOf } = input
  const gap = options.gap
  const laneIds = new Set<string>(chainOf.values())
  const isDummy = (id: string): boolean => chainOf.has(id)
  const isPoint = (id: string): boolean => isDummy(id) || laneIds.has(id)
  const widthOf = (id: string): number => (isPoint(id) ? 0 : sizeOf(id).width)
  const heightOf = (id: string): number => (isPoint(id) ? 0 : sizeOf(id).height)
  const laneOf = (id: string): string => chainOf.get(id) ?? id
  const x = new Map<string, number>()
  const read = (id: string): number => x.get(laneOf(id)) ?? 0

  const above = new Map<string, string[]>()
  const below = new Map<string, string[]>()
  const laneEnds = new Map<string, string[]>()
  const link = (into: Map<string, string[]>, id: string, other: string): void => {
    into.set(id, [...(into.get(id) ?? []), other])
  }
  for (const chain of chains) {
    for (let cursor = 0; cursor + 1 < chain.path.length; cursor += 1) {
      const top = chain.path[cursor]
      const bottom = chain.path[cursor + 1]
      // A lane is not a neighbour to align with: only two boxes are, which is what keeps a box over the boxes it
      // connects to when a long edge crosses its row.
      if (!isDummy(top) && !isDummy(bottom)) {
        link(below, top, bottom)
        link(above, bottom, top)
      }
    }
    if (chain.path.length > 2) {
      const lane = chainOf.get(chain.path[1])
      if (lane !== undefined) laneEnds.set(lane, [chain.path[0], chain.path[chain.path.length - 1]])
    }
  }

  // The four layouts, averaged. A pass that starts at the top and a pass that starts at the bottom compact their
  // blocks from opposite ends, so the four answers do not share an origin: each side is first slid onto the origin of
  // the first pass of that side, and only then are they averaged. Averaging is what balances them - a box that aligned
  // in one pass and not in another keeps the part the passes agreed on, which is the paper's last step, at the cost of
  // one average.
  const candidates = frames(layers, above, below).map((frame) => onePass(frame, widthOf, gap))
  const leftOrigin = extentOf(candidates[0], layers, widthOf).left
  const rightOrigin = extentOf(candidates[1], layers, widthOf).right
  for (const [index, candidate] of candidates.entries()) {
    const extent = extentOf(candidate, layers, widthOf)
    const shift = index % 2 === 0 ? leftOrigin - extent.left : rightOrigin - extent.right
    for (const [id, value] of candidate) candidate.set(id, value + shift)
  }
  for (const row of layers) {
    for (const id of row) {
      let total = 0
      for (const candidate of candidates) total += candidate.get(id) ?? 0
      x.set(id, total / candidates.length)
    }
  }

  // What each row has to make room for. The boxes are one part; the space the lane's placeholders were given by the
  // compaction is the other, because that is where a corridor can run when the lane's own proposal lands on a box. A
  // row that reserved nothing for its lanes is as wide as its boxes; a row whose lane had to go around a box keeps the
  // width that detour needed, so the page is planned for the drawing that will be painted rather than the boxes alone.
  const reserved = layers.map((layer) => {
    let lowest = Infinity
    let highest = -Infinity
    for (const id of layer) {
      const value = x.get(id) as number
      lowest = Math.min(lowest, value - widthOf(id) / 2)
      highest = Math.max(highest, value + widthOf(id) / 2)
    }
    return { lowest, highest }
  })

  // A lane is one variable across every row it crosses. The four passes give each of its dummies its own x; the lane
  // takes the mean of what its two ends want, because the straight drop between them is what a reader follows. The rows
  // it crosses are the channel stage's to keep it clear of. It stays a proposal either way: `channels.ts` moves a lane
  // that lands on a box.
  for (const [lane, ends] of laneEnds) x.set(lane, ((x.get(ends[0]) as number) + (x.get(ends[1]) as number)) / 2)
  for (const id of chainOf.keys()) x.delete(id)

  // The rows keep their order and their gap. A lane in a row does not move a box out of the way; a box does move for
  // the box before it, because two boxes on top of each other is the one thing a drawing may not do.
  for (const row of layers) {
    let cursor = -Infinity
    for (const id of row) {
      if (isDummy(id)) {
        cursor = Math.max(cursor, read(id))
        continue
      }
      const width = widthOf(id)
      const centre = Math.max(x.get(id) as number, cursor + width / 2)
      x.set(id, centre)
      cursor = centre + width / 2 + gap
    }
  }

  let left = 0
  for (const [id, value] of x) left = Math.min(left, value - widthOf(id) / 2)
  for (const [id, value] of x) x.set(id, value - left)

  const layerHeight = layers.map((layer) => Math.max(0, ...layer.map((id) => heightOf(id))))
  const layerWidth = layers.map((layer, depth) => {
    let lowest = (reserved[depth].lowest as number) - left
    let highest = (reserved[depth].highest as number) - left
    for (const id of layer) {
      const value = read(id)
      lowest = Math.min(lowest, value - widthOf(id) / 2)
      highest = Math.max(highest, value + widthOf(id) / 2)
    }
    return highest > lowest ? highest - lowest : 0
  })
  const layerY: number[] = []
  let top = 0
  for (const [depth, height] of layerHeight.entries()) {
    layerY.push(top)
    top += height + options.layerGap
  }
  let width = 0
  for (const [id, value] of x) width = Math.max(width, value + widthOf(id) / 2)
  return {
    x,
    layerY,
    layerHeight,
    layerWidth,
    width,
    height: layerY.length === 0 ? 0 : (layerY[layerY.length - 1] as number) + (layerHeight[layerHeight.length - 1] as number),
  }
}
