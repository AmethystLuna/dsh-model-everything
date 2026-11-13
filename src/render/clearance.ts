/**
 * Moving a run that hugs a box into the middle of the channel it runs down.
 *
 * The renderer's guarantee is that a route never crosses a box. It says nothing about running half a pixel beside one, and a line
 * that grazes a border reads as if it touched it. This module is the arithmetic of the repair: for one interior run of a polyline,
 * how far to move it, and what the moved polyline is.
 *
 * The decision about what a box is and whether the moved line is free stays with the painter: this module knows rectangles as
 * numbers and nothing else.
 */

/** How close a line may run to a box it does not end at. */
export const CLEARANCE = 6

/** The closest a run has to be to something before it is worth moving. */
export const HUG = 3

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Run {
  /** Index of the first point of the run in the polyline. */
  index: number
  /** `x` for a vertical run (it sits at one x), `y` for a horizontal one. */
  axis: 'x' | 'y'
  /** The coordinate the run sits at. */
  at: number
  /** Its extent along the other axis. */
  lo: number
  hi: number
}

/** The interior runs of a polyline: every one with a neighbour on both sides, so moving it keeps the path connected. */
export function interiorRuns(points: readonly { x: number; y: number }[]): Run[] {
  const runs: Run[] = []
  for (let index = 1; index + 2 < points.length; index += 1) {
    const from = points[index] as { x: number; y: number }
    const to = points[index + 1] as { x: number; y: number }
    const vertical = Math.abs(from.x - to.x) < 0.5
    const horizontal = Math.abs(from.y - to.y) < 0.5
    if (!vertical && !horizontal) continue
    runs.push(
      vertical
        ? { index, axis: 'x', at: from.x, lo: Math.min(from.y, to.y), hi: Math.max(from.y, to.y) }
        : { index, axis: 'y', at: from.y, lo: Math.min(from.x, to.x), hi: Math.max(from.x, to.x) },
    )
  }
  return runs
}

/**
 * Where the run should sit instead, or `undefined` when it is not hugging anything.
 *
 * A run within `HUG` of a box's edge is moved `CLEARANCE` away from that edge. Nothing is centred between two boxes: the case that
 * produced this module was a line a half pixel from one box's border, and a rule for the corridor's middle never fired on any
 * drawing here - an unused branch in a layout pass is a branch that will drift.
 */
export function channelTarget(run: Run, rects: readonly Rect[]): number | undefined {
  const spanLo = run.lo + 2
  const spanHi = run.hi - 2
  let low: number | undefined
  let high: number | undefined
  for (const rect of rects) {
    const otherLo = run.axis === 'x' ? rect.y : rect.x
    const otherHi = otherLo + (run.axis === 'x' ? rect.height : rect.width)
    // The box has to be beside the run for most of its length, not merely near one end of it.
    if (Math.min(spanHi, otherHi) - Math.max(spanLo, otherLo) < 4) continue
    const near = run.axis === 'x' ? rect.x : rect.y
    const far = near + (run.axis === 'x' ? rect.width : rect.height)
    // Which side of the box the run is on decides which way it has to go: a run just left of the near edge clears the near
    // edge, and a run just right of the far edge clears the far one. Reading them the wrong way round moved a line through
    // the box it was hugging.
    if (Math.abs(run.at - near) <= HUG) high = high === undefined ? near : Math.min(high, near)
    if (Math.abs(run.at - far) <= HUG) low = low === undefined ? far : Math.max(low, far)
  }
  // A run squeezed between two boxes closer than it can clear keeps its place: moving it would trade one hug for another.
  if (low !== undefined && high !== undefined) return undefined
  if (low !== undefined) return low + CLEARANCE
  if (high !== undefined) return high - CLEARANCE
  return undefined
}
/** The polyline with the run at `target`; the two points of the run move, their neighbours stretch. */
export function movedRun(points: readonly { x: number; y: number }[], run: Run, target: number): { x: number; y: number }[] {
  const out = points.map((point) => ({ ...point }))
  const first = out[run.index] as { x: number; y: number }
  const second = out[run.index + 1] as { x: number; y: number }
  if (run.axis === 'x') {
    first.x = target
    second.x = target
  } else {
    first.y = target
    second.y = target
  }
  return out
}
