/**
 * The jog a route steps through on its way into a port.
 *
 * A port the node offered and the lane the channel stage chose can disagree by a couple of pixels, and the route steps
 * sideways between them. At that size the step reads as a kink a reader sees and cannot name. The port is the node's own
 * statement about where the line attaches, so the lane adopts it: the leg before the jog moves onto the port's line and
 * the jog disappears.
 *
 * Kept apart from the painter because it is arithmetic on points, with no canvas and no boxes of its own: the caller says
 * whether a candidate is allowed, which is the only thing this module cannot know.
 */
import type { Point } from './place.js'

/** A step shorter than this is a kink, not a leg. */
export const SNAP_JOG = 6

/** How many jogs one route may have removed before the walk stops: four is past anything a routed edge carries. */
const SNAP_ROUNDS = 4

/**
 * Remove the jogs shorter than `SNAP_JOG` from one route.
 *
 * Returns the new points, or `undefined` when nothing was removed, so the caller can leave the route untouched. `blocked`
 * is asked about every candidate that would move a leg: it answers whether the two segments through the new corner pass
 * through something they must not.
 */
export function snapJogs(
  points: readonly Point[],
  blocked: (from: Point, candidate: Point, to: Point) => boolean,
): Point[] | undefined {
  let changed = false
  const out = points.map((point) => ({ ...point }))
  for (let round = 0; round < SNAP_ROUNDS; round += 1) {
    let moved = false
    for (let index = 2; index < out.length - 1; index += 1) {
      const before = out[index - 1] as Point
      const corner = out[index] as Point
      const after = out[index + 1] as Point
      const vertical = Math.abs(corner.x - before.x) < 0.01 && Math.abs(corner.y - before.y) > 0.01
      const horizontal = Math.abs(corner.y - before.y) < 0.01 && Math.abs(corner.x - before.x) > 0.01
      if (!vertical && !horizontal) continue
      const jog = Math.hypot(corner.x - before.x, corner.y - before.y)
      if (jog < 0.01 || jog >= SNAP_JOG) continue
      // both neighbours must run across the jog, or this is a real corner and not a kink
      const lead = out[index - 2] as Point
      const beforeAcross = vertical ? Math.abs(lead.y - before.y) < 0.01 : Math.abs(lead.x - before.x) < 0.01
      const afterAcross = vertical ? Math.abs(after.y - corner.y) < 0.01 : Math.abs(after.x - corner.x) < 0.01
      if (!beforeAcross || !afterAcross) continue
      // The *parallel* leg moves onto the corner's line, both of its ends together: moving one end would leave a
      // diagonal where an orthogonal leg used to be, which is a worse defect than the kink it removes.
      const movedLead = vertical ? { ...lead, y: corner.y } : { ...lead, x: corner.x }
      const movedBefore = vertical ? { ...before, y: corner.y } : { ...before, x: corner.x }
      const previous = out[index - 3] as Point | undefined
      if (blocked(previous === undefined ? movedLead : previous, movedLead, movedBefore)) continue
      if (blocked(movedLead, movedBefore, { ...after })) continue
      out[index - 2] = movedLead
      out[index - 1] = movedBefore
      // The corner and the point before it are collinear with the leg that moved: both go.
      out.splice(index, 1)
      out.splice(index - 1, 1)
      moved = true
      changed = true
      break
    }
    if (!moved) break
  }
  return changed ? out : undefined
}
