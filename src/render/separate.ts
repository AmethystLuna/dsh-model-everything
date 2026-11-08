/**
 * Reading a drawing for the defect of two routes drawn as one line.
 *
 * A route is a sequence of axis-aligned pieces. Two pieces on the same line, or within a few points of each other,
 * overlap for the length they share, and that length is what a reader loses: the eye follows one line with two heads.
 * Everything here is arithmetic on pieces, which is why it is apart from the painter: the drawing's worth of routes comes
 * in, a number comes out, and a test can hand it two polylines without a canvas.
 */
import type { Point } from './place.js'

/** One straight run of a route: the axis it runs along, where on the other axis, and the span it covers. */
export interface Piece {
  /** `y` for a horizontal run (it sits at one y), `x` for a vertical one. */
  axis: 'x' | 'y'
  /** The coordinate the run sits at on the other axis. */
  at: number
  lo: number
  hi: number
  /** Which leg of the route this is, so a move can be applied back to the points. */
  slot: number
}

/** Two pieces this far apart read as one line: closer than the eye separates them at a corner. */
export const NEAR_LINE = 5

/** Every axis-aligned piece of one route. A diagonal leg contributes nothing: it is not a line to be read as another. */
export function piecesFrom(points: readonly Point[]): Piece[] {
  const out: Piece[] = []
  for (let index = 1; index < points.length; index += 1) {
    const one = points[index - 1] as Point
    const two = points[index] as Point
    if (Math.abs(one.y - two.y) < 0.5 && Math.abs(one.x - two.x) > 1) {
      out.push({ axis: 'y', at: one.y, lo: Math.min(one.x, two.x), hi: Math.max(one.x, two.x), slot: index - 1 })
    } else if (Math.abs(one.x - two.x) < 0.5 && Math.abs(one.y - two.y) > 1) {
      out.push({ axis: 'x', at: one.x, lo: Math.min(one.y, two.y), hi: Math.max(one.y, two.y), slot: index - 1 })
    }
  }
  return out
}

/** How much of the line one pair of pieces shares. */
const shared = (mine: Piece, theirs: Piece): number => {
  if (mine.axis !== theirs.axis) return 0
  if (Math.abs(mine.at - theirs.at) >= NEAR_LINE) return 0
  // A single point of contact is not a length: the minus one keeps touching corners out of the total.
  return Math.max(0, Math.min(mine.hi, theirs.hi) - Math.max(mine.lo, theirs.lo) - 1)
}

/** The length one route shares with every other, which is half of what those pairs contribute to the drawing. */
export function sharedWith(all: readonly Piece[][], index: number): number {
  let total = 0
  const mine = all[index] as Piece[]
  for (let other = 0; other < all.length; other += 1) {
    if (other === index) continue
    for (const piece of mine) {
      for (const theirs of all[other] as Piece[]) total += shared(piece, theirs)
    }
  }
  return total
}

/** The whole drawing's shared length: each pair once, from the lower index. */
export function sharedLength(all: readonly Piece[][]): number {
  let total = 0
  for (let left = 0; left < all.length; left += 1) {
    for (let right = left + 1; right < all.length; right += 1) {
      for (const mine of all[left] as Piece[]) {
        for (const theirs of all[right] as Piece[]) total += shared(mine, theirs)
      }
    }
  }
  return total
}

/** The same total from the rows, which is what a caller keeps while it tries moves. */
export function totalFromRows(rows: readonly number[]): number {
  return rows.reduce((total, value) => total + value, 0) / 2
}
