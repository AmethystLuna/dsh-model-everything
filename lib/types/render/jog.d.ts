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
import type { Point } from './place.js';
/** A step shorter than this is a kink, not a leg. */
export declare const SNAP_JOG = 6;
/**
 * Remove the jogs shorter than `SNAP_JOG` from one route.
 *
 * Returns the new points, or `undefined` when nothing was removed, so the caller can leave the route untouched. `blocked`
 * is asked about every candidate that would move a leg: it answers whether the two segments through the new corner pass
 * through something they must not.
 */
export declare function snapJogs(points: readonly Point[], blocked: (from: Point, candidate: Point, to: Point) => boolean): Point[] | undefined;
