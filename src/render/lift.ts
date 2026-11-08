/**
 * Lifting the short stub that ends a route.
 *
 * A route arrives at a port along a leg. When the layout packs two edges into one gap that leg can end up shorter than the
 * arrowhead needs, and a reader sees a ledge rather than an approach. The fix is to move the line before it far enough back
 * that the arrival is a whole stub again - but only when the line it makes is free, which is why the caller answers two
 * questions and this module decides the length.
 *
 * Pure arithmetic on one route: the painter owns the boxes and the other routes, so neither is here.
 */
import type { Point } from './place.js'

/** The shortest arrival a reader reads as an approach rather than as a ledge. */
export const WHOLE_STUB = 16

/** The lengths to try, longest first: a shorter one is better than a ledge, and none is better than a crossing. */
export const STUB_LADDER = [WHOLE_STUB, 12, 10, 8] as const

export interface Tail {
  /** True when the leg into the box runs vertically, which is a top or bottom side. */
  down: boolean
  /** The point the leg ends at: the port. */
  tail: Point
  /** The corner the leg starts from. */
  corner: Point
  /** The point before the corner, which the lifted line has to leave alone. */
  head: Point
  /** How far the leg runs as it stands. */
  along: number
}

/** The last leg of a route, or `undefined` when the route is too short to have one. */
export function tailOf(points: readonly Point[]): Tail | undefined {
  if (points.length < 3) return undefined
  const tail = points[points.length - 1] as Point
  const corner = points[points.length - 2] as Point
  const head = points[points.length - 3] as Point
  const down = Math.abs(corner.x - tail.x) < 0.5
  const along = down ? Math.abs(corner.y - tail.y) : Math.abs(corner.x - tail.x)
  return { down, tail, corner, head, along }
}

/**
 * The length the arrival should have, or `undefined` when none of the ladder is free.
 *
 * `free` answers whether the line a given length would make is allowed: clear of every box it does not end at, and clear of
 * every other route by the near line.
 */
export function liftedSpan(
  points: readonly Point[],
  free: (line: readonly Point[], span: number) => boolean,
): number | undefined {
  const tail = tailOf(points)
  if (tail === undefined) return undefined
  if (tail.along >= WHOLE_STUB) return undefined
  for (const span of STUB_LADDER) {
    const { down, tail: port, corner, head } = tail
    const target = down ? port.y - Math.sign(port.y - corner.y) * span : port.x - Math.sign(port.x - corner.x) * span
    // A length that would put the lifted line on the point before the corner is not a lift: it folds the route back on itself.
    if (down ? Math.abs(target - head.y) < 2 : Math.abs(target - head.x) < 2) continue
    const line = down
      ? [{ x: corner.x, y: target }, { x: head.x, y: target }]
      : [{ x: target, y: corner.y }, { x: target, y: head.y }]
    if (!free(line, span)) continue
    return span
  }
  return undefined
}

/** Apply a lift in place: the corner and the point before it both move onto the lifted line. */
export function applyLift(points: Point[], span: number): boolean {
  const tail = tailOf(points)
  if (tail === undefined) return false
  const { down, tail: port, corner } = tail
  const target = down ? port.y - Math.sign(port.y - corner.y) * span : port.x - Math.sign(port.x - corner.x) * span
  const cornerPoint = points[points.length - 2] as Point
  const headPoint = points[points.length - 3] as Point
  if (down) {
    cornerPoint.y = target
    headPoint.y = target
  } else {
    cornerPoint.x = target
    headPoint.x = target
  }
  return true
}
