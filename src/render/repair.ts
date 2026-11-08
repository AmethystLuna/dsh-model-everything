/**
 * The last repair a route gets before the drawing is declared.
 *
 * A route can still pass through a box after every stage has had its say, and there is exactly one stage left that knows how
 * to go round one: the router. It is asked twice - first with the ports the channel stage chose, then with its own choice of
 * sides, because a port can make the crossing unavoidable - and the first answer that clears every box is the one drawn.
 *
 * A wrong answer is worse than no answer here: a route that cannot be drawn honestly is reported by the caller, not moved onto
 * another box. So the repair is only taken when it actually clears, and this module cannot check that itself - the caller owns
 * the boxes.
 */
import type { Point } from './place.js'

/** What the caller can do about one route: say whether it crosses, and ask the router twice. */
export interface RepairTools {
  /** Does this path pass through a box it does not end at? */
  crosses(path: readonly Point[]): boolean
  /** The router's answer for these ports, or with its own choice of sides when `anchors` is undefined. */
  route(anchors: unknown): Point[]
}

/**
 * The repaired path, or `undefined` when there is nothing to do or nothing that helps.
 *
 * `undefined` covers both refusals the caller treats the same way: the path does not cross, so no repair is attempted; or every
 * answer still crosses, so the drawing keeps the route it had and reports it.
 */
export function repairedRoute(path: readonly Point[], withPorts: unknown, tools: RepairTools): Point[] | undefined {
  if (!tools.crosses(path)) return undefined
  for (const anchors of [withPorts, undefined]) {
    const again = tools.route(anchors)
    if (tools.crosses(again)) continue
    return again
  }
  return undefined
}
