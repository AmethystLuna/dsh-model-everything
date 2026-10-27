/**
 * Orthogonal edge routing around boxes.
 *
 * A straight line between two boxes is right until a third box sits between them; then it is a line drawn through a
 * component, which reads as a connection that is not there. Graphviz solves this by routing along a visibility
 * graph and then fitting splines; ELK, yFiles and mxGraph build a *sparse* grid from the boxes' own edges and run
 * A* over it with a bend penalty. Sparse is the whole trick: a pixel grid is O(pixels²), while the candidate lines
 * are the coordinate of every box edge plus a margin - O(boxes) per axis.
 *
 * So this module does exactly that, in the two steps those routers use:
 *
 * 1. **Candidate lines.** Every box contributes four: one lane just outside each side. Together with the anchor
 *    coordinates they form the grid a route may travel on.
 * 2. **A* with bends.** Moving along a candidate line costs its length; changing direction costs extra, because a
 *    route that zig-zags to save three points is harder to follow than one that goes around.
 *
 * A route is only computed for an edge that needs it: the cheap straight segment is tried first, and routing is the
 * fallback. That keeps the common case - a box directly above another - at two points and no search.
 */

import type { Point } from './paint.js'

/** A rectangle an edge may not cross. */
export interface Obstacle {
  x: number
  y: number
  width: number
  height: number
}

/** The four sides a route may leave a box from. */
export type Side = 'top' | 'bottom' | 'left' | 'right'

/** How far outside a box a lane runs, so a route does not graze the border. */
const LANE_GAP = 10

/** What a bend costs, in points of length: a route prefers one long detour to three small ones. */
const BEND_COST = 24

/** A segment crossing a box at all, with a little slack so a route does not shave a corner. */
export function crossesBox(x1: number, y1: number, x2: number, y2: number, box: Obstacle): boolean {
  const minX = box.x + 0.5
  const maxX = box.x + box.width - 0.5
  const minY = box.y + 0.5
  const maxY = box.y + box.height - 0.5
  // Axis-aligned segments are the ones this router emits; test them exactly rather than by sampling.
  if (Math.abs(y1 - y2) < 0.001) {
    const y = y1
    if (y <= minY || y >= maxY) return false
    return Math.max(x1, x2) > minX && Math.min(x1, x2) < maxX
  }
  if (Math.abs(x1 - x2) < 0.001) {
    const x = x1
    if (x <= minX || x >= maxX) return false
    return Math.max(y1, y2) > minY && Math.min(y1, y2) < maxY
  }
  // A diagonal (the fallback, and the straight segment): sample it. Cheap, and only ever used for one segment.
  const steps = Math.max(8, Math.round(Math.hypot(x2 - x1, y2 - y1)))
  for (let index = 0; index <= steps; index += 1) {
    const x = x1 + ((x2 - x1) * index) / steps
    const y = y1 + ((y2 - y1) * index) / steps
    if (x > minX && x < maxX && y > minY && y < maxY) return true
  }
  return false
}

/** The point on a side of a box, in the middle of that side. */
export function anchor(box: Obstacle, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: box.x + box.width / 2, y: box.y }
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height }
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 }
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2 }
  }
}

/** Which side of `from` faces `to`, and which side of `to` faces `from`. */
export function facingSides(from: Obstacle, to: Obstacle): { exit: Side; entry: Side } {
  const fromCx = from.x + from.width / 2
  const fromCy = from.y + from.height / 2
  const toCx = to.x + to.width / 2
  const toCy = to.y + to.height / 2
  const dx = toCx - fromCx
  const dy = toCy - fromCy
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? { exit: 'bottom', entry: 'top' } : { exit: 'top', entry: 'bottom' }
  return dx >= 0 ? { exit: 'right', entry: 'left' } : { exit: 'left', entry: 'right' }
}

interface Candidate {
  point: Point
  /** The direction the route is travelling when it arrives: 0 horizontal, 1 vertical, -1 unknown. */
  axis: -1 | 0 | 1
  cost: number
  bends: number
  path: Point[]
}

/** The lane coordinates a route may use: both sides of every obstacle, plus the anchors themselves. */
function lanes(obstacles: Obstacle[], extra: number[]): number[] {
  const values = new Set<number>(extra)
  for (const box of obstacles) {
    values.add(box.x - LANE_GAP)
    values.add(box.x + box.width + LANE_GAP)
    values.add(box.y - LANE_GAP)
    values.add(box.y + box.height + LANE_GAP)
  }
  return [...values].sort((left, right) => left - right)
}

/**
 * Route from one box to another, going around any box in the way.
 *
 * Returns the polyline to draw. When nothing blocks the straight segment, or when every candidate is blocked (a
 * single box that fills the drawing), the straight line is returned and the caller keeps a two-point shape - an
 * unroutable edge is still an edge, and drawing it straight is more honest than dropping it.
 */
export function routeEdge(
  from: Obstacle,
  to: Obstacle,
  obstacles: Obstacle[],
  anchors?: { exit: Point; entry: Point },
): { points: Point[]; routed: boolean } {
  const sides = facingSides(from, to)
  const exit = anchors?.exit ?? anchor(from, sides.exit)
  const entry = anchors?.entry ?? anchor(to, sides.entry)

  const others = obstacles.filter((box) => box !== from && box !== to)
  const straight = [exit, entry]
  if (!others.some((box) => crossesBox(exit.x, exit.y, entry.x, entry.y, box))) return { points: straight, routed: false }

  // The grid: one axis is x-lane values, the other y-lane values, and the routes are their intersections.
  const xs = lanes(others, [exit.x, entry.x])
  const ys = lanes(others, [exit.y, entry.y])

  const blocked = (x1: number, y1: number, x2: number, y2: number): boolean =>
    others.some((box) => crossesBox(x1, y1, x2, y2, box))

  const start: Candidate = { point: exit, axis: -1, cost: 0, bends: 0, path: [exit] }
  const queue: Candidate[] = [start]
  const best = new Map<string, number>()
  const key = (point: Point): string => String(Math.round(point.x)) + ',' + String(Math.round(point.y))

  while (queue.length > 0) {
    // Small graphs: a linear scan for the cheapest open node is simpler than a heap and just as correct.
    let index = 0
    for (let cursor = 1; cursor < queue.length; cursor += 1) if (queue[cursor].cost < queue[index].cost) index = cursor
    const current = queue.splice(index, 1)[0]
    if (current.cost > (best.get(key(current.point)) ?? Infinity)) continue
    if (Math.abs(current.point.x - entry.x) < 0.5 && Math.abs(current.point.y - entry.y) < 0.5) {
      return { points: simplify([...current.path]), routed: true }
    }
    const options: Point[] = []
    for (const x of xs) if (Math.abs(x - current.point.x) > 0.5) options.push({ x, y: current.point.y })
    for (const y of ys) if (Math.abs(y - current.point.y) > 0.5) options.push({ x: current.point.x, y })
    for (const next of options) {
      if (blocked(current.point.x, current.point.y, next.x, next.y)) continue
      const axis: 0 | 1 = Math.abs(next.y - current.point.y) < 0.5 ? 0 : 1
      const bend = current.axis === -1 || current.axis === axis ? 0 : 1
      const cost = current.cost + Math.abs(next.x - current.point.x) + Math.abs(next.y - current.point.y) + bend * BEND_COST
      const state = key(next)
      if (cost >= (best.get(state) ?? Infinity)) continue
      best.set(state, cost)
      queue.push({ point: next, axis, cost, bends: current.bends + bend, path: [...current.path, next] })
    }
  }
  return { points: straight, routed: false }
}

/** Drop the points in the middle of a straight run: three collinear points are one segment. */
export function simplify(points: Point[]): Point[] {
  if (points.length <= 2) return points
  const out: Point[] = [points[0]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = out[out.length - 1]
    const current = points[index]
    const next = points[index + 1]
    const collinear =
      (Math.abs(previous.x - current.x) < 0.5 && Math.abs(current.x - next.x) < 0.5) ||
      (Math.abs(previous.y - current.y) < 0.5 && Math.abs(current.y - next.y) < 0.5)
    if (!collinear) out.push(current)
  }
  out.push(points[points.length - 1])
  return out
}
