/**
 * Where an edge's label sits.
 *
 * A label is not furniture parked beside the line: it names the transition, so it sits on the line - anchored on one of its
 * own straight runs - and the writer masks the stretch of line it covers. Text beside a line can be read as belonging to
 * whatever it happens to sit next to; text that interrupts its own line reads as part of it.
 *
 * The anchor then has to be earned, and earning it is arithmetic on rectangles. The painter supplies what a candidate would
 * cover - a count per kind, because a mask over a box is worse than one over a line - and this module walks the runs and
 * decides. It is never handed the boxes: a module that can see where they are starts deciding where they go.
 */
import type { Point } from './place.js'
import { textWidth } from './text.js'

export interface LabelPlacement {
  /** The straight run it sits on, 0 being the edge's longest. */
  run: number
  /** Everything its mask overlaps: the other labels, boxes and edges it would have had to move off its line to clear. */
  collisions: number
  boxes: number
  labels: number
  edges: number
}

/**
 * How tall the mask an edge label is drawn over is.
 *
 * Exported because two modules must agree on it: the painter reserves the rectangle when it looks for a clear
 * place, and the writer draws the rectangle that was reserved. A label with two sizes is a label half masked.
 */
export const LABEL_HEIGHT = 12

/**
 * The room a label's mask keeps from anything it may not cover, so two rectangles never read as one.
 *
 * Exported because the painter does the covering test: it holds the boxes and the other routes, and this module only asks how
 * many of each a candidate would cover.
 */
export const LABEL_PAD = 2

/** How far a label steps along its own run while it looks for a clear place to sit. */
const LABEL_STEP = 3


/** Where a label sits: the point it is centred on, and the rectangle its mask covers. */
interface LabelSpot {
  x: number
  y: number
  width: number
  height: number
}

/** A straight run of an edge: one of the pieces a label may sit on. */
interface Run {
  from: Point
  to: Point
  /** The run is axis-aligned, so its Manhattan length is its length. */
  length: number
  /** Where the run sits in the route, so two equal runs keep the order they are drawn in. */
  index: number
}

/** The runs of one edge, longest first. A label prefers the run with the most room. */
function runsOf(points: readonly Point[]): Run[] {
  const runs: Run[] = []
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
    if (length < 1) continue
    runs.push({ from, to, length, index })
  }
  return runs.sort((left, right) => right.length - left.length || left.index - right.index)
}

/** What one candidate would cover, counted by the kind of thing it covers. */
export interface Covered {
  boxes: number
  labels: number
  edges: number
}

export function placeLabel(
  label: string,
  points: readonly Point[],
  covered: (spot: LabelSpot) => Covered,
): LabelPlacement & LabelSpot {
  const width = textWidth(label)
  const height = LABEL_HEIGHT
  const spotAt = (x: number, y: number): LabelSpot => ({ x, y, width, height })
  const collisionsAt = (spot: LabelSpot, run: number): LabelPlacement => {
    const counted = covered(spot)
    return {
      run,
      collisions: counted.boxes + counted.labels + counted.edges,
      boxes: counted.boxes,
      labels: counted.labels,
      edges: counted.edges,
    }
  }

  const runs = runsOf(points)
  if (runs.length === 0) {
    // A route with no straight piece has no line to sit on: keep the label at the route's own point rather than move
    // it into the air. Only a degenerate route reaches this, and the writer still draws its mask.
    const point = points[0] ?? { x: 0, y: 0 }
    return { ...spotAt(point.x, point.y), run: -1, collisions: 0, boxes: 0, labels: 0, edges: 0 }
  }

  let best: (LabelPlacement & LabelSpot) | undefined
  for (const [runIndex, run] of runs.entries()) {
    const dx = run.to.x - run.from.x
    const dy = run.to.y - run.from.y
    const ux = dx / run.length
    const uy = dy / run.length
    const middle = { x: (run.from.x + run.to.x) / 2, y: (run.from.y + run.to.y) / 2 }
    // The walk is bounded so the label's own rectangle stays on the run that names it: a mask that hangs off the
    // end of its segment would be half over the next thing and would not read as sitting on this edge.
    const along = (Math.abs(ux) * width) / 2 + (Math.abs(uy) * height) / 2
    const bound = Math.max(0, run.length / 2 - along)
    const walk: number[] = [0]
    for (let step = LABEL_STEP; step <= bound + 0.001; step += LABEL_STEP) walk.push(step, -step)
    // Beside the line as well as along it. A label that has nowhere clear on a short run used to take the spot with the
    // fewest collisions, which on a turned drawing is where the next box and its labels already are; stepping off the
    // line a few pixels is what a reader does with a crowded edge, and the along-run spots are still tried first.
    const steps: Array<{ along: number; across: number }> = walk.map((offset) => ({ along: offset, across: 0 }))
    // Two steps aside, in the order a reader looks: the line itself first, then just off it. Deeper searches move a label
    // further from the edge it names and, on a crowded drawing, decide differently which run the label belongs to - so the
    // bound is the drawing's preference, not a tuning knob.
    for (const across of [LABEL_STEP, -LABEL_STEP, LABEL_STEP * 2, -LABEL_STEP * 2]) {
      for (const offset of walk) steps.push({ along: offset, across })
    }
    for (const { along: offset, across } of steps) {
      const spot = spotAt(middle.x + ux * offset - uy * across, middle.y + uy * offset + ux * across)
      const placement = collisionsAt(spot, runIndex)
      // A clear place is the answer, and the first one is the preferred one: the search order is already the
      // drawing's preference - longest run, own midpoint, then either side.
      if (placement.collisions === 0) return { ...spot, ...placement }
      if (
        best === undefined ||
        placement.collisions < best.collisions ||
        (placement.collisions === best.collisions && placement.boxes + placement.labels < best.boxes + best.labels)
      ) {
        best = { ...spot, ...placement }
      }
    }
  }
  return best as LabelPlacement & LabelSpot
}
